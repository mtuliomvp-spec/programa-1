"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen, getCashboxWorkDate, openCashbox, closeCashbox } from "@/lib/cashbox";
import { getSessionUser } from "@/lib/auth";
import { assertCan } from "@/lib/guards";
import { assertMonthOpen, monthLabelBR } from "@/lib/monthly-closing";
import { parseDateInput } from "@/lib/format";

export type ContaFormState = { error?: string };

/**
 * Abre o caixa (todos os caixas/bancos de uma vez). Sem abrir, nenhum lançamento
 * é permitido. `workDate` é a "data de trabalho" (default hoje).
 */
export async function openCashboxAction(workDate?: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };
  try {
    await assertCan("financeiro", "contas");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const date = workDate ? parseDateInput(workDate) : new Date();
  // Não abrir caixa em um mês já encerrado (fechamento mensal): depois de
  // fechar o mês, nada mais pode ser lançado nele.
  try {
    await assertMonthOpen(date);
  } catch {
    const label = monthLabelBR(date.getUTCFullYear(), date.getUTCMonth() + 1);
    return {
      ok: false,
      error: `O mês ${label} já foi encerrado — não é possível abrir o caixa nele. Abra o caixa em um mês em aberto ou reabra o mês em Financeiro → Fechamento Mensal.`,
    };
  }
  await openCashbox(user.name, date);
  revalidatePath("/financeiro/contas");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Estorna, de uma vez, todas as baixas (pagamentos e recebimentos) feitas no
 * caixa aberto (data de trabalho) — "zera o caixa do dia". Títulos voltam a
 * PENDENTE e avulsos são apagados; baixas de origem (venda/recorrência/etc.)
 * não são tocadas e vêm reportadas para reverter na origem.
 */
export async function revertCashboxAction(): Promise<{
  ok: boolean;
  error?: string;
  revertidos?: number;
  pulados?: number;
  puladosDescricoes?: string[];
}> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };
  try {
    await assertCan("financeiro", "contas");
    await assertCashboxOpen();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bloqueado." };
  }
  const date = await getCashboxWorkDate();
  try {
    await assertMonthOpen(date);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Mês fechado." };
  }

  const { revertCashboxBaixas } = await import("@/lib/finance");
  let res;
  try {
    res = await revertCashboxBaixas(date);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível estornar o caixa." };
  }
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/capital");
  revalidatePath("/", "layout");
  return { ok: true, ...res };
}

/** Fecha o caixa: bloqueia novos lançamentos até reabrir. */
export async function closeCashboxAction(): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };
  try {
    await assertCan("financeiro", "contas");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  await closeCashbox(user.name);
  revalidatePath("/financeiro/contas");
  revalidatePath("/", "layout");
  return { ok: true };
}

const accountSchema = z.object({
  name: z.string().min(1, "Informe o nome da conta"),
  type: z.enum(["CAIXA", "BANCO", "POUPANCA", "FINANCEIRA", "OUTRO"]),
  bankName: z.string().optional(),
  agency: z.string().optional(),
  accountNumber: z.string().optional(),
  initialBalance: z.coerce.number().default(0),
  isDefault: z.coerce.boolean().optional(),
  isInvestment: z.coerce.boolean().optional(),
  investmentMaturity: z.string().optional(),
  returnTaxPercent: z.coerce.number().min(0).max(100).default(0),
  // Titular verdadeiro da conta (sócio/beneficiário do capital). Vazio = MVP.
  ownerBeneficiaryId: z.string().optional(),
});

export async function createAccountAction(
  _prev: ContaFormState,
  formData: FormData,
): Promise<ContaFormState> {
  try {
    await assertCan("financeiro", "contas");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = accountSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const data = parsed.data;

  const count = await prisma.financialAccount.count();
  // Conta de Aplicação nunca é a conta padrão das baixas nem começa com saldo:
  // o saldo dela é construído pelas operações de aplicação (razão por sócio).
  const isInvestment = Boolean(data.isInvestment);
  const isDefault = !isInvestment && (Boolean(data.isDefault) || count === 0);

  await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.financialAccount.updateMany({ data: { isDefault: false } });
    }
    await tx.financialAccount.create({
      data: {
        name: data.name,
        type: data.type,
        bankName: data.bankName || null,
        agency: data.agency || null,
        accountNumber: data.accountNumber || null,
        initialBalance: isInvestment ? 0 : data.initialBalance,
        isDefault,
        isInvestment,
        // Só faz sentido em conta de Aplicação (mesmo padrão do returnTaxPercent).
        investmentMaturity:
          isInvestment && data.investmentMaturity ? parseDateInput(data.investmentMaturity) : null,
        returnTaxPercent: data.type === "FINANCEIRA" && !isInvestment ? data.returnTaxPercent : 0,
        // Titular verdadeiro vale para qualquer conta — inclusive Aplicação (a
        // conta no banco pode ser de um sócio; o rateio interno é outra coisa).
        ownerBeneficiaryId: data.ownerBeneficiaryId || null,
      },
    });
  });
  revalidatePath("/financeiro/contas");
  return {};
}

/**
 * Define/troca o titular verdadeiro de uma conta já cadastrada (sócio dono da
 * conta, que opera como se fosse da MVP). Nulo = conta da própria empresa.
 * Informativo — não altera saldos nem a equação patrimonial.
 */
/**
 * Define/limpa o vencimento da aplicação. Fica na página da conta porque o
 * sistema não tem formulário de EDIÇÃO de conta — só de criação — e sem isto
 * as contas de aplicação que já existem ficariam sem como informar a data.
 */
export async function setAccountMaturityAction(
  id: string,
  dateInput: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("financeiro", "contas");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const account = await prisma.financialAccount.findUnique({
    where: { id },
    select: { isInvestment: true },
  });
  if (!account) return { ok: false, error: "Conta não encontrada." };
  if (!account.isInvestment) {
    return { ok: false, error: "Só conta de Aplicação tem vencimento." };
  }
  await prisma.financialAccount.update({
    where: { id },
    // Vazio limpa a data (aplicação sem prazo / liquidez diária).
    data: { investmentMaturity: dateInput ? parseDateInput(dateInput) : null },
  });
  revalidatePath("/financeiro/contas");
  revalidatePath(`/financeiro/contas/${id}`);
  revalidatePath("/");
  return { ok: true };
}

export async function setAccountOwnerAction(
  id: string,
  beneficiaryId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("financeiro", "contas");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  if (beneficiaryId) {
    const b = await prisma.capitalBeneficiary.findUnique({ where: { id: beneficiaryId }, select: { id: true } });
    if (!b) return { ok: false, error: "Beneficiário não encontrado." };
  }
  await prisma.financialAccount.update({
    where: { id },
    data: { ownerBeneficiaryId: beneficiaryId || null },
  });
  revalidatePath("/financeiro/contas");
  revalidatePath(`/financeiro/contas/${id}`);
  return { ok: true };
}

/**
 * Atualiza os percentuais do retorno da financeira: o imposto retido e o
 * percentual do retorno líquido que vai para o vendedor como comissão.
 */
export async function updateFinancerTaxAction(
  id: string,
  percent: number,
  sellerPercent = 0,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("financeiro", "contas");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const p = Number(percent);
  const sp = Number(sellerPercent);
  if (!Number.isFinite(p) || p < 0 || p > 100) {
    return { ok: false, error: "Informe um percentual de imposto entre 0 e 100." };
  }
  if (!Number.isFinite(sp) || sp < 0 || sp > 100) {
    return { ok: false, error: "Informe um percentual do vendedor entre 0 e 100." };
  }
  await prisma.financialAccount.update({
    where: { id },
    data: { returnTaxPercent: p, sellerReturnPercent: sp },
  });
  revalidatePath("/financeiro/contas");
  revalidatePath(`/financeiro/contas/${id}`);
  return { ok: true };
}

export async function setDefaultAccountAction(id: string) {
  await assertCan("financeiro", "contas");
  await prisma.$transaction(async (tx) => {
    await tx.financialAccount.updateMany({ data: { isDefault: false } });
    await tx.financialAccount.update({ where: { id }, data: { isDefault: true, active: true } });
  });
  revalidatePath("/financeiro/contas");
}

export async function toggleAccountAction(id: string, active: boolean) {
  await assertCan("financeiro", "contas");
  await prisma.financialAccount.update({
    where: { id },
    data: { active, isDefault: active ? undefined : false },
  });
  revalidatePath("/financeiro/contas");
}

const transferSchema = z.object({
  fromId: z.string().min(1, "Escolha a conta de origem"),
  toId: z.string().min(1, "Escolha a conta de destino"),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  description: z.string().optional(),
});

export async function createTransferAction(
  _prev: ContaFormState,
  formData: FormData,
): Promise<ContaFormState> {
  try {
    await assertCan("financeiro", "contas");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const parsed = transferSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const data = parsed.data;
  if (data.fromId === data.toId) return { error: "Origem e destino precisam ser contas diferentes." };
  const invest = await prisma.financialAccount.findMany({
    where: { id: { in: [data.fromId, data.toId] }, isInvestment: true },
    select: { id: true },
  });
  if (invest.length > 0) {
    return {
      error:
        "Contas de Aplicação não recebem transferência comum. Use a tela da conta (Aplicar / Resgatar).",
    };
  }
  // A transferência segue a data de trabalho do caixa aberto (como as baixas).
  const date = await getCashboxWorkDate();
  try {
    await assertMonthOpen(date);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Mês fechado." };
  }

  await prisma.accountTransfer.create({
    data: {
      fromId: data.fromId,
      toId: data.toId,
      amount: data.amount,
      date,
      description: data.description || null,
    },
  });
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  return {};
}

export async function deleteTransferAction(id: string) {
  await assertCan("financeiro", "contas");
  await prisma.accountTransfer.delete({ where: { id } });
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
}

/**
 * Corrige o Check 1 (saldos convergentes): atribui o Banco Neutro (conta de
 * compensação que fica sempre em zero) a todo dinheiro recebido/pago que ficou
 * SEM conta financeira. As transações internas (como a troca) se anulam ali.
 * É uma ação de correção — por isso não é bloqueada.
 */
export async function fixUnattributedBaixasAction(): Promise<{ error?: string; fixed?: number }> {
  try {
    await assertCan("financeiro", "contas");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const { getNeutralAccountId } = await import("@/lib/accounts");
  const neutralId = await getNeutralAccountId();

  const [rec, pay] = await Promise.all([
    prisma.receivable.updateMany({
      where: { status: "RECEBIDO", accountId: null },
      data: { accountId: neutralId },
    }),
    prisma.payable.updateMany({
      where: { status: "PAGO", accountId: null },
      data: { accountId: neutralId },
    }),
  ]);

  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/");
  return { fixed: rec.count + pay.count };
}

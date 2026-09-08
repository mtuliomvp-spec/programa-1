"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { NEUTRAL_ACCOUNT_NAME } from "@/lib/accounts";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen, getCashboxWorkDate, openCashbox, closeCashbox } from "@/lib/cashbox";
import { getSessionUser } from "@/lib/auth";
import { assertCan, assertCanAny } from "@/lib/guards";
import { markPayablePaid } from "@/lib/finance";
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

  // O Banco Neutro é criado pelo sistema: impede o usuário de cadastrar uma
  // segunda conta com esse nome (duas contas de compensação bagunçariam o
  // farol e o livro caixa).
  if (data.name.trim().toLowerCase() === NEUTRAL_ACCOUNT_NAME.toLowerCase()) {
    return {
      error:
        "\"Banco Neutro\" é uma conta do próprio sistema, criada automaticamente. Escolha outro nome.",
    };
  }

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
 * Edita os dados de uma conta já cadastrada. Nome, banco, agência, número e
 * tipo eram pedidos só no cadastro e depois ficavam congelados — uma agência
 * digitada errada não tinha conserto, e agora ela decide se o comprovante
 * reconhece sozinho a conta debitada.
 *
 * As travas são as mesmas que o resto do sistema já respeita:
 *  - Banco Neutro é conta do sistema: não se edita (nem o nome, que é a chave
 *    pela qual o farol e a troca a encontram).
 *  - SALDO INICIAL só muda enquanto a conta não tem movimento: ele entra no
 *    Lucro/Prejuízo (na data de criação da conta) e na equação patrimonial, e
 *    mexer nele com histórico reescreve o resultado de meses já apurados.
 *  - Conta de APLICAÇÃO não vira conta comum (e vice-versa): o saldo dela é
 *    rateado entre os sócios; trocar isso deixaria a razão do capital órfã.
 *  - Sair de FINANCEIRA só sem venda financiada apontando para ela.
 */
export async function updateAccountAction(
  _prev: ContaFormState,
  formData: FormData,
): Promise<ContaFormState> {
  try {
    await assertCan("financeiro", "contas");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const id = String(formData.get("id") || "").trim();
  if (!id) return { error: "Conta inválida." };
  const parsed = accountSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const data = parsed.data;

  const conta = await prisma.financialAccount.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      structural: true,
      isInvestment: true,
      initialBalance: true,
      isDefault: true,
      createdAt: true,
      _count: { select: { payables: true, receivables: true, financedSales: true, allocations: true } },
    },
  });
  if (!conta) return { error: "Conta não encontrada." };
  if (conta.structural) {
    return {
      error:
        "O Banco Neutro é uma conta do próprio sistema (conta de compensação) — os dados dela não são editáveis.",
    };
  }

  const nome = data.name.trim();
  if (nome.toLowerCase() === NEUTRAL_ACCOUNT_NAME.toLowerCase()) {
    return { error: '"Banco Neutro" é o nome da conta de compensação do sistema. Escolha outro nome.' };
  }

  // Movimento = qualquer título baixado nesta conta ou transferência que a
  // envolva. É o que impede mexer no saldo inicial.
  const transferencias = await prisma.accountTransfer.count({
    where: { OR: [{ fromId: id }, { toId: id }] },
  });
  const temMovimento =
    conta._count.payables > 0 || conta._count.receivables > 0 || transferencias > 0;

  const novoSaldo = conta.isInvestment ? 0 : data.initialBalance;
  const saldoMudou = Math.abs(novoSaldo - conta.initialBalance) > 0.005;
  if (saldoMudou && temMovimento) {
    return {
      error:
        "Esta conta já tem lançamentos: o saldo inicial não pode mais mudar (ele já entrou no Lucro/Prejuízo e na equação patrimonial). Ajuste por um lançamento no movimento de caixa.",
    };
  }
  // Sem movimento, mas o mês em que a conta nasceu pode já estar encerrado —
  // o saldo inicial entra no resultado naquela data.
  if (saldoMudou) {
    try {
      await assertMonthOpen(conta.createdAt);
    } catch {
      return {
        error: `O mês em que esta conta foi cadastrada (${monthLabelBR(conta.createdAt.getUTCFullYear(), conta.createdAt.getUTCMonth() + 1)}) já está encerrado — o saldo inicial não pode mais mudar.`,
      };
    }
  }

  if (Boolean(data.isInvestment) !== conta.isInvestment) {
    return {
      error: conta.isInvestment
        ? "Conta de Aplicação não vira conta comum: o saldo dela é rateado entre os sócios. Zere a aplicação e cadastre outra conta."
        : "Conta comum não vira conta de Aplicação. Cadastre uma conta de Aplicação e transfira o dinheiro para ela.",
    };
  }

  if (conta.type === "FINANCEIRA" && data.type !== "FINANCEIRA" && conta._count.financedSales > 0) {
    return {
      error:
        "Há vendas financiadas apontando para esta conta — ela precisa continuar do tipo Financeira.",
    };
  }

  await prisma.financialAccount.update({
    where: { id },
    data: {
      name: nome,
      type: data.type,
      bankName: data.bankName?.trim() || null,
      agency: data.agency?.trim() || null,
      accountNumber: data.accountNumber?.trim() || null,
      initialBalance: novoSaldo,
      investmentMaturity:
        conta.isInvestment && data.investmentMaturity ? parseDateInput(data.investmentMaturity) : null,
      returnTaxPercent: data.type === "FINANCEIRA" && !conta.isInvestment ? data.returnTaxPercent : 0,
      ownerBeneficiaryId: data.ownerBeneficiaryId || null,
    },
  });

  revalidatePath("/financeiro/contas");
  revalidatePath(`/financeiro/contas/${id}`);
  revalidatePath("/financeiro/livro-caixa");
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
  const alvo = await prisma.financialAccount.findUnique({
    where: { id },
    select: { structural: true },
  });
  if (alvo?.structural) return { ok: false, error: STRUCTURAL_BLOCK };
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

/**
 * Contas estruturais (Banco Neutro) são do SISTEMA, não do usuário: nascem
 * sozinhas e não podem ser desativadas, viradas em conta padrão nem ter o
 * titular trocado. A interface já esconde essas ações; isto é a defesa no
 * servidor.
 */
const STRUCTURAL_BLOCK =
  "O Banco Neutro faz parte da estrutura do sistema (conta de compensação) e não pode ser alterado nem excluído.";

async function assertNotStructural(id: string) {
  const account = await prisma.financialAccount.findUnique({
    where: { id },
    select: { structural: true },
  });
  if (account?.structural) throw new Error(STRUCTURAL_BLOCK);
}

export async function setDefaultAccountAction(id: string) {
  await assertCan("financeiro", "contas");
  await assertNotStructural(id);
  await prisma.$transaction(async (tx) => {
    await tx.financialAccount.updateMany({ data: { isDefault: false } });
    await tx.financialAccount.update({ where: { id }, data: { isDefault: true, active: true } });
  });
  revalidatePath("/financeiro/contas");
}

export async function toggleAccountAction(id: string, active: boolean) {
  await assertCan("financeiro", "contas");
  await assertNotStructural(id);
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
  // O Banco Neutro só é movimentado pelas operações internas (que sempre lançam
  // o par que o zera). Uma transferência manual o tiraria de zero.
  const estruturais = await prisma.financialAccount.findMany({
    where: { id: { in: [data.fromId, data.toId] }, structural: true },
    select: { id: true },
  });
  if (estruturais.length > 0) return { error: STRUCTURAL_BLOCK };
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

// ---------------------------------------------------------------------------
// Fila de espera do caixa: pré-lançamentos aguardando o ok para debitar
// ---------------------------------------------------------------------------

export type ConfirmQueueResult = { ok: boolean; error?: string; paid?: number };

/**
 * Dá o OK num pré-lançamento: o dinheiro já saiu do banco (o comprovante está
 * anexado) e agora a baixa acontece de verdade, no caixa do dia aberto. O
 * valor é o do COMPROVANTE — pago com desconto, juros ou multa, vale o que o
 * banco debitou — e a divergência vai para a observação do título.
 */
export async function confirmQueuedPaymentsAction(
  ids: string[],
  accountByPayable: Record<string, string> = {},
): Promise<ConfirmQueueResult> {
  if (!ids.length) return { ok: false, error: "Selecione ao menos um pré-lançamento." };
  try {
    await assertCan("financeiro", "pagar");
    await assertBooksBalanced();
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

  const { prepararBaixaDaFila, desenfileirarPagamento } = await import("@/lib/payment-queue");
  let paid = 0;
  for (const id of ids) {
    const p = await prisma.payable.findUnique({
      where: { id },
      select: { id: true, status: true, pendingPaymentAccountId: true, pendingPaymentDate: true },
    });
    if (!p || p.status === "PAGO" || !p.pendingPaymentDate) continue;
    const accountId = accountByPayable[id] || p.pendingPaymentAccountId;
    if (!accountId) {
      return {
        ok: false,
        paid,
        error: "Escolha a conta debitada dos pré-lançamentos que estão sem conta identificada.",
      };
    }
    await prepararBaixaDaFila(id, date);
    await markPayablePaid(id, date, accountId);
    await desenfileirarPagamento(id);
    paid += 1;
  }

  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/");
  return { ok: true, paid };
}

/** Tira o título da fila sem baixar nada (comprovante trocado, engano...). */
export async function dismissQueuedPaymentAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCanAny([
      ["financeiro", "pagar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const { desenfileirarPagamento } = await import("@/lib/payment-queue");
  await desenfileirarPagamento(id);
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/a-pagar");
  return { ok: true };
}

"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen, openCashbox, closeCashbox } from "@/lib/cashbox";
import { getSessionUser } from "@/lib/auth";
import { assertCan } from "@/lib/guards";
import { assertMonthOpen } from "@/lib/monthly-closing";
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
  await openCashbox(user.name, date);
  revalidatePath("/financeiro/contas");
  revalidatePath("/", "layout");
  return { ok: true };
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
  returnTaxPercent: z.coerce.number().min(0).max(100).default(0),
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
  const isDefault = Boolean(data.isDefault) || count === 0;

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
        initialBalance: data.initialBalance,
        isDefault,
        returnTaxPercent: data.type === "FINANCEIRA" ? data.returnTaxPercent : 0,
      },
    });
  });
  revalidatePath("/financeiro/contas");
  return {};
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
  date: z.string().min(1),
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
  try {
    await assertMonthOpen(parseDateInput(data.date));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Mês fechado." };
  }

  await prisma.accountTransfer.create({
    data: {
      fromId: data.fromId,
      toId: data.toId,
      amount: data.amount,
      date: parseDateInput(data.date),
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

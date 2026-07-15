"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertBooksBalanced } from "@/lib/books-health";
import { parseDateInput } from "@/lib/format";

export type ContaFormState = { error?: string };

const accountSchema = z.object({
  name: z.string().min(1, "Informe o nome da conta"),
  type: z.enum(["CAIXA", "BANCO", "POUPANCA", "FINANCEIRA", "OUTRO"]),
  bankName: z.string().optional(),
  agency: z.string().optional(),
  accountNumber: z.string().optional(),
  initialBalance: z.coerce.number().default(0),
  isDefault: z.coerce.boolean().optional(),
});

export async function createAccountAction(
  _prev: ContaFormState,
  formData: FormData,
): Promise<ContaFormState> {
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
      },
    });
  });
  revalidatePath("/financeiro/contas");
  return {};
}

export async function setDefaultAccountAction(id: string) {
  await prisma.$transaction(async (tx) => {
    await tx.financialAccount.updateMany({ data: { isDefault: false } });
    await tx.financialAccount.update({ where: { id }, data: { isDefault: true, active: true } });
  });
  revalidatePath("/financeiro/contas");
}

export async function toggleAccountAction(id: string, active: boolean) {
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
    await assertBooksBalanced();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const parsed = transferSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const data = parsed.data;
  if (data.fromId === data.toId) return { error: "Origem e destino precisam ser contas diferentes." };

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

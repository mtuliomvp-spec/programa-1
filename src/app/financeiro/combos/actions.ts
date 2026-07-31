"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { getSessionUser } from "@/lib/auth";
import { markPayablePaid } from "@/lib/finance";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen, getCashboxWorkDate } from "@/lib/cashbox";
import { assertMonthOpen } from "@/lib/monthly-closing";

type Result = { ok: boolean; error?: string };

function revalidate(comboId?: string) {
  revalidatePath("/financeiro/combos");
  if (comboId) revalidatePath(`/financeiro/combos/${comboId}`);
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/");
}

/** Cria um combo ABERTO cujo beneficiário é o usuário logado. */
export async function createComboAction(name: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const clean = (name || "").trim();
  if (!clean) return { ok: false, error: "Informe um nome para o combo." };
  const user = await getSessionUser();
  const combo = await prisma.paymentCombo.create({ data: { name: clean, userId: user?.id ?? null } });
  revalidate(combo.id);
  return { ok: true, id: combo.id };
}

/** Joga títulos (não pagos e sem combo) para dentro de um combo ABERTO. */
export async function addPayablesToComboAction(comboId: string, ids: string[]): Promise<{ ok: boolean; added: number; error?: string }> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, added: 0, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  if (!ids.length) return { ok: false, added: 0, error: "Selecione ao menos um título." };
  const combo = await prisma.paymentCombo.findUnique({ where: { id: comboId }, select: { status: true } });
  if (!combo) return { ok: false, added: 0, error: "Combo não encontrado." };
  if (combo.status !== "ABERTO") return { ok: false, added: 0, error: "Este combo já foi fechado." };
  const res = await prisma.payable.updateMany({
    where: { id: { in: ids }, status: { not: "PAGO" }, paymentComboId: null },
    data: { paymentComboId: comboId },
  });
  revalidate(comboId);
  return { ok: true, added: res.count };
}

/** Tira um título do combo (só enquanto ABERTO). */
export async function removePayableFromComboAction(payableId: string): Promise<Result> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const p = await prisma.payable.findUnique({
    where: { id: payableId },
    select: { paymentComboId: true, paymentCombo: { select: { status: true } } },
  });
  if (!p?.paymentComboId) return { ok: false, error: "Título não está em um combo." };
  if (p.paymentCombo?.status !== "ABERTO") return { ok: false, error: "O combo já foi fechado." };
  await prisma.payable.update({ where: { id: payableId }, data: { paymentComboId: null } });
  revalidate(p.paymentComboId);
  return { ok: true };
}

/** Encerra o combo: ABERTO → SOLICITADO (gera o total/borderô a pagar). */
export async function requestComboAction(comboId: string): Promise<Result> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const combo = await prisma.paymentCombo.findUnique({
    where: { id: comboId },
    select: { status: true, _count: { select: { payables: true } } },
  });
  if (!combo) return { ok: false, error: "Combo não encontrado." };
  if (combo.status !== "ABERTO") return { ok: false, error: "Este combo já foi fechado." };
  if (combo._count.payables === 0) return { ok: false, error: "Adicione ao menos um título antes de solicitar o pagamento." };
  await prisma.paymentCombo.update({ where: { id: comboId }, data: { status: "SOLICITADO", requestedAt: new Date() } });
  revalidate(comboId);
  return { ok: true };
}

/** Paga o combo: quita todos os títulos de uma vez na conta escolhida. */
export async function payComboAction(comboId: string, accountId: string): Promise<Result> {
  try {
    await assertCan("financeiro", "pagar");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bloqueado." };
  }
  if (!accountId) return { ok: false, error: "Escolha a conta que fará o pagamento." };
  const date = await getCashboxWorkDate();
  try {
    await assertMonthOpen(date);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Mês fechado." };
  }
  const combo = await prisma.paymentCombo.findUnique({
    where: { id: comboId },
    select: { status: true, payables: { where: { status: { not: "PAGO" } }, select: { id: true } } },
  });
  if (!combo) return { ok: false, error: "Combo não encontrado." };
  if (combo.status !== "SOLICITADO") return { ok: false, error: "Solicite o pagamento do combo antes de pagá-lo." };

  for (const p of combo.payables) {
    await markPayablePaid(p.id, date, accountId);
  }
  await prisma.paymentCombo.update({
    where: { id: comboId },
    data: { status: "PAGO", paidAt: date, accountId },
  });
  revalidate(comboId);
  return { ok: true };
}

/** Cancela o combo (não pago): solta os títulos de volta e marca CANCELADO. */
export async function cancelComboAction(comboId: string): Promise<Result> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const combo = await prisma.paymentCombo.findUnique({ where: { id: comboId }, select: { status: true } });
  if (!combo) return { ok: false, error: "Combo não encontrado." };
  if (combo.status === "PAGO") return { ok: false, error: "Combo já pago — não pode ser cancelado." };
  await prisma.$transaction([
    prisma.payable.updateMany({ where: { paymentComboId: comboId }, data: { paymentComboId: null } }),
    prisma.paymentCombo.update({ where: { id: comboId }, data: { status: "CANCELADO" } }),
  ]);
  revalidate(comboId);
  return { ok: true };
}

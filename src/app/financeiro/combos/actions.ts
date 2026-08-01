"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan, assertCanAny } from "@/lib/guards";
import { getSessionUser } from "@/lib/auth";
import { markPayablePaid } from "@/lib/finance";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen, getCashboxWorkDate } from "@/lib/cashbox";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { freeCapitalOf } from "@/lib/investments";
import { structuralCenterId } from "@/lib/structural";

const round2 = (n: number) => Math.round(n * 100) / 100;

type Result = { ok: boolean; error?: string };

function revalidate(comboId?: string) {
  revalidatePath("/financeiro/combos");
  if (comboId) revalidatePath(`/financeiro/combos/${comboId}`);
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/capital");
  revalidatePath("/");
}

/** Cria um combo ABERTO cujo beneficiário é o usuário logado. */
export async function createComboAction(name: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    await assertCan("combos", "criar");
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
    await assertCan("combos", "criar");
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
    await assertCan("combos", "criar");
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
    await assertCan("combos", "criar");
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

/** Exclui um combo CANCELADO — só administrador. */
export async function deleteComboAction(comboId: string): Promise<Result> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sessão expirada." };
  if (user.role !== "ADMIN") return { ok: false, error: "Apenas administrador pode excluir combos." };
  const combo = await prisma.paymentCombo.findUnique({ where: { id: comboId }, select: { status: true } });
  if (!combo) return { ok: false, error: "Combo não encontrado." };
  if (combo.status !== "CANCELADO") return { ok: false, error: "Só é possível excluir combos cancelados." };
  await prisma.$transaction([
    // Garantia: solta qualquer título ainda vinculado antes de apagar.
    prisma.payable.updateMany({ where: { paymentComboId: comboId }, data: { paymentComboId: null } }),
    prisma.paymentCombo.delete({ where: { id: comboId } }),
  ]);
  revalidate();
  return { ok: true };
}

/** Liga/desliga o pagamento integral (não abater o saldo devedor do beneficiário). */
export async function setComboPayFullAction(comboId: string, value: boolean): Promise<Result> {
  try {
    await assertCanAny([
      ["combos", "criar"],
      ["combos", "aprovar"],
    ]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const combo = await prisma.paymentCombo.findUnique({ where: { id: comboId }, select: { status: true } });
  if (!combo) return { ok: false, error: "Combo não encontrado." };
  if (combo.status === "PAGO" || combo.status === "CANCELADO") {
    return { ok: false, error: "Combo já finalizado — não é possível alterar." };
  }
  await prisma.paymentCombo.update({ where: { id: comboId }, data: { payFull: value } });
  revalidate(comboId);
  return { ok: true };
}

/** Paga o combo: quita todos os títulos de uma vez na conta escolhida. */
export async function payComboAction(comboId: string, accountId: string): Promise<Result> {
  try {
    await assertCan("combos", "aprovar");
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
    select: {
      status: true,
      name: true,
      userId: true,
      payFull: true,
      payables: { where: { status: { not: "PAGO" } }, select: { id: true, amount: true } },
    },
  });
  if (!combo) return { ok: false, error: "Combo não encontrado." };
  if (combo.status !== "SOLICITADO") return { ok: false, error: "Solicite o pagamento do combo antes de pagá-lo." };

  // Beneficiário do combo (quem o montou) com saldo LIVRE de capital negativo:
  // parte do total cobre esse débito como APORTE (igual à comissão do vendedor);
  // o resto sai em dinheiro. Fica equação-neutra (aporte na mesma conta).
  // Se o combo estiver marcado como "valor integral" (payFull), não abate.
  const total = round2(combo.payables.reduce((s, p) => s + p.amount, 0));
  let abate = 0;
  let beneficiary: { id: string; name: string } | null = null;
  if (combo.userId && !combo.payFull) {
    beneficiary = await prisma.capitalBeneficiary.findUnique({
      where: { userId: combo.userId },
      select: { id: true, name: true },
    });
    if (beneficiary) {
      const free = await freeCapitalOf(beneficiary.id);
      const debt = Math.max(0, round2(-free));
      abate = round2(Math.min(total, debt));
    }
  }

  // 1) Quita todos os títulos do combo na conta escolhida.
  for (const p of combo.payables) {
    await markPayablePaid(p.id, date, accountId);
  }

  // 2) Abate o saldo devedor do beneficiário: aporte na mesma conta (o par
  //    recebível↔capital é neutro e o DRE exclui o aporte pelo receivableId).
  if (abate > 0.005 && beneficiary) {
    const capitalCenterId = await structuralCenterId("CAPITAL");
    await prisma.$transaction(async (tx) => {
      const receivable = await tx.receivable.create({
        data: {
          costCenterId: capitalCenterId,
          description: `Aporte p/ abater saldo devedor de capital (combo ${combo.name}) - ${beneficiary!.name}`,
          category: "OUTROS",
          amount: abate,
          dueDate: date,
          receivedDate: date,
          status: "RECEBIDO",
          accountId,
          capitalBeneficiaryId: beneficiary!.id,
        },
      });
      await tx.capitalTransaction.create({
        data: {
          beneficiaryId: beneficiary!.id,
          kind: "APORTE",
          amount: abate,
          date,
          description: `Abatido do saldo devedor pelo combo ${combo.name}`,
          receivableId: receivable.id,
        },
      });
    });
  }

  await prisma.paymentCombo.update({
    where: { id: comboId },
    data: { status: "PAGO", paidAt: date, accountId, capitalAbatement: abate },
  });
  revalidate(comboId);
  return { ok: true };
}

/** Cancela o combo (não pago): solta os títulos de volta e marca CANCELADO. */
export async function cancelComboAction(comboId: string): Promise<Result> {
  try {
    await assertCan("combos", "criar");
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

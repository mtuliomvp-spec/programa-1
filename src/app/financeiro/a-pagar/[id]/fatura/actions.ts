"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCanAny } from "@/lib/guards";
import { syncCardInvoiceDerived } from "@/lib/card-invoice";

export type CorrigirSocioResult = { ok: boolean; error?: string; message?: string };

/**
 * Corrige DE QUEM é a retirada de um lançamento de fatura do fluxo Capital —
 * inclusive numa fatura já PAGA, que é onde o erro aparece: a despesa pessoal
 * foi marcada no sócio errado e só se percebe quando o capital de alguém não
 * bate.
 *
 * Nada de dinheiro se move: o título continua pago pelo mesmo valor, na mesma
 * data e na mesma conta. O que muda é o dono da RETIRADA — o capital total da
 * loja é o mesmo (sai de um sócio, entra no outro), então a equação
 * patrimonial e o Lucro/Prejuízo não sentem, e por isso a correção é possível
 * mesmo com o mês do pagamento já encerrado.
 */
export async function corrigirSocioDoLancamentoAction(
  itemId: string,
  beneficiaryId: string,
): Promise<CorrigirSocioResult> {
  try {
    await assertCanAny([
      ["administrativo", "capital"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  if (!itemId || !beneficiaryId) return { ok: false, error: "Escolha o sócio." };

  const item = await prisma.cardInvoiceItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      payableId: true,
      structuralKey: true,
      capitalBeneficiaryId: true,
      amount: true,
      description: true,
    },
  });
  if (!item) return { ok: false, error: "Lançamento não encontrado." };
  if (item.structuralKey !== "CAPITAL") {
    return { ok: false, error: "Só dá para trocar o sócio de um lançamento do fluxo Capital." };
  }
  if (item.capitalBeneficiaryId === beneficiaryId) return { ok: true, message: "Nada a corrigir." };

  const novo = await prisma.capitalBeneficiary.findUnique({
    where: { id: beneficiaryId },
    select: { name: true, active: true },
  });
  if (!novo) return { ok: false, error: "Sócio não encontrado." };
  if (!novo.active) return { ok: false, error: "Esse beneficiário está inativo." };

  await prisma.cardInvoiceItem.update({
    where: { id: item.id },
    data: { capitalBeneficiaryId: beneficiaryId },
  });
  // A retirada segue o lançamento: a sincronização da fatura reaponta a
  // transação de capital (que é 1:1 com o item) para o novo sócio, mantendo
  // valor e data. Com a fatura ainda pendente não há transação — ela nasce
  // certa na baixa.
  await syncCardInvoiceDerived(item.payableId);

  revalidatePath(`/financeiro/a-pagar/${item.payableId}/fatura`);
  revalidatePath(`/financeiro/a-pagar/${item.payableId}/editar`);
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/capital");
  revalidatePath("/");
  return { ok: true, message: `Retirada passada para ${novo.name}.` };
}

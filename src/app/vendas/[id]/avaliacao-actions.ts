"use server";

import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";

/** Registra que o pedido de avaliação no Google foi enviado ao comprador. */
export async function marcarAvaliacaoPedidaAction(saleId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("vendas", "visualizar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  await prisma.sale.update({ where: { id: saleId }, data: { reviewRequestedAt: new Date() } }).catch(() => null);
  return { ok: true };
}

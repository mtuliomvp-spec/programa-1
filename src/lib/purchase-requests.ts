import "server-only";
import type { TransactionClient } from "@/lib/prisma";

/**
 * Próximo número da solicitação de compra no ano (0001/2026, reiniciando a
 * cada ano). Fica aqui, e não dentro de uma action, para os dois caminhos que
 * criam solicitação — o formulário e a importação de NF — usarem a MESMA
 * numeração. Precisa rodar dentro da transação que cria a solicitação.
 */
export async function nextRequestSeq(tx: TransactionClient, year: number): Promise<number> {
  const last = await tx.purchaseRequest.aggregate({ where: { year }, _max: { seq: true } });
  return (last._max.seq ?? 0) + 1;
}

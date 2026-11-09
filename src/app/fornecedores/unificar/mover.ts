import "server-only";
import type { TransactionClient } from "@/lib/prisma";

/**
 * As SEIS tabelas que apontam para fornecedor. Todas as chaves são opcionais
 * com SetNull: excluir um fornecedor sem repontar antes deixaria o lançamento
 * sem dono em silêncio. Chave nova de fornecedor no schema → entra aqui.
 */
export async function repontarFornecedor(
  tx: TransactionClient,
  ficaId: string,
  someIds: string[],
): Promise<number> {
  const where = { supplierId: { in: someIds } };
  const data = { supplierId: ficaId };
  const r = await Promise.all([
    tx.vehicle.updateMany({ where, data }),
    tx.part.updateMany({ where, data }),
    tx.payable.updateMany({ where, data }),
    tx.recurringEntry.updateMany({ where, data }),
    tx.purchaseRequest.updateMany({ where, data }),
    tx.devolucaoCompra.updateMany({ where, data }),
  ]);
  return r.reduce((s, x) => s + x.count, 0);
}

/**
 * Trava contra órfão: se alguma tabela ainda apontar para um cadastro que vai
 * sumir, desfaz tudo (lança erro dentro da transação). Só então exclui.
 */
export async function conferirEExcluir(tx: TransactionClient, someIds: string[]): Promise<void> {
  const where = { supplierId: { in: someIds } };
  const sobra = await Promise.all([
    tx.vehicle.count({ where }),
    tx.part.count({ where }),
    tx.payable.count({ where }),
    tx.recurringEntry.count({ where }),
    tx.purchaseRequest.count({ where }),
    tx.devolucaoCompra.count({ where }),
  ]);
  if (sobra.some((n) => n > 0)) {
    throw new Error("Ainda há lançamentos ligados aos cadastros que seriam excluídos. Nada foi alterado.");
  }
  await tx.supplier.deleteMany({ where: { id: { in: someIds } } });
}

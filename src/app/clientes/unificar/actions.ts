"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { formatDate } from "@/lib/format";
import { findCustomerDuplicates } from "./detect";

export type MergeResult = {
  ok: boolean;
  groups: number;
  moved: number;
  removed: number;
  names: string[];
  error?: string;
};

/**
 * Unifica os clientes duplicados: repõe vendas, vendas de peças, recebíveis,
 * recorrências e PRÉ-VENDAS no cadastro que fica e exclui os repetidos.
 *
 * A pré-venda é o ponto delicado: ela guarda o `customerId` como texto solto,
 * sem chave estrangeira, então o banco não impediria a exclusão e a proposta
 * passaria a apontar para um cliente inexistente. Ela é repontada junto — e a
 * trava antes do DELETE confere isso.
 *
 * Neutro no farol: nenhum cálculo lê cliente (ele aparece só como nome).
 * Idempotente: depois de rodar, a varredura não encontra mais nada.
 */
export async function mergeDuplicateCustomersAction(): Promise<MergeResult> {
  try {
    await assertCan("cadastros", "unificar");
  } catch (e) {
    return {
      ok: false,
      groups: 0,
      moved: 0,
      removed: 0,
      names: [],
      error: e instanceof Error ? e.message : "Sem permissão.",
    };
  }

  const groups = (await findCustomerDuplicates()).filter((g) => !g.blocked && g.winner);
  if (groups.length === 0) return { ok: true, groups: 0, moved: 0, removed: 0, names: [] };

  const today = formatDate(new Date());
  const allLoserIds = groups.flatMap((g) => g.losers.map((l) => l.id));

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const g of groups) {
          const winnerId = g.winner!.id;
          const loserIds = g.losers.map((l) => l.id);
          const where = { customerId: { in: loserIds } };
          const data = { customerId: winnerId };
          await tx.sale.updateMany({ where, data });
          await tx.partSale.updateMany({ where, data });
          await tx.receivable.updateMany({ where, data });
          await tx.recurringEntry.updateMany({ where, data });
          // Sem chave estrangeira: se não repontar, a pré-venda fica órfã.
          await tx.preSale.updateMany({ where, data });

          const audit = `Unificado em ${today}: ${g.losers.map((l) => l.name).join(", ")}.`;
          const notes = [g.enrich.notes ?? g.winner!.data.notes, audit].filter(Boolean).join(" · ");
          await tx.customer.update({
            where: { id: winnerId },
            data: { ...g.enrich, name: g.survivingName, notes },
          });
        }

        const where = { customerId: { in: allLoserIds } };
        const left = await Promise.all([
          tx.sale.count({ where }),
          tx.partSale.count({ where }),
          tx.receivable.count({ where }),
          tx.recurringEntry.count({ where }),
          tx.preSale.count({ where }),
        ]);
        if (left.some((n) => n > 0)) {
          throw new Error(
            "Ainda há lançamentos ligados aos cadastros que seriam excluídos. Nada foi alterado.",
          );
        }

        await tx.customer.deleteMany({ where: { id: { in: allLoserIds } } });
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    return {
      ok: false,
      groups: 0,
      moved: 0,
      removed: 0,
      names: [],
      error: e instanceof Error ? e.message : "Não foi possível unificar.",
    };
  }

  revalidatePath("/", "layout");
  revalidatePath("/clientes/unificar");

  return {
    ok: true,
    groups: groups.length,
    moved: groups.reduce((sum, g) => sum + g.moved, 0),
    removed: allLoserIds.length,
    names: groups.map((g) => g.survivingName),
  };
}

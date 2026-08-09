"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { formatDate } from "@/lib/format";
import { findSupplierDuplicates } from "./detect";

export type MergeResult = {
  ok: boolean;
  groups: number;
  moved: number;
  removed: number;
  names: string[];
  error?: string;
};

/**
 * Unifica os fornecedores duplicados: repõe os lançamentos no cadastro que
 * fica e exclui os repetidos.
 *
 * A ORDEM É O QUE IMPORTA. As cinco chaves estrangeiras de fornecedor são
 * opcionais com `SetNull` por omissão (schema.prisma): se o DELETE rodar antes
 * de repontar, o Postgres zera os `supplierId` em silêncio e os lançamentos
 * ficam órfãos — exatamente o que não pode acontecer. Por isso: repontar as
 * cinco, conferir que não sobrou ninguém apontando para os perdedores, e só
 * então excluir — tudo na mesma transação.
 *
 * Neutro no farol: nenhum cálculo da equação patrimonial ou da DRE lê
 * fornecedor (ele aparece só como nome em src/lib/reports.ts).
 *
 * Idempotente: depois de rodar, a varredura não encontra mais nada.
 */
export async function mergeDuplicateSuppliersAction(): Promise<MergeResult> {
  try {
    await assertCan("cadastros", "excluir");
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

  // Refaz a detecção no servidor — não confia em nada vindo da tela.
  // Nenhum perdedor pode ser espelho de usuário (a detecção já garante isso —
  // o espelho sempre vence e grupo com dois é bloqueado); a conferência aqui é
  // contra um erro futuro, porque excluir um espelho o traria de volta.
  const groups = (await findSupplierDuplicates()).filter(
    (g) => !g.blocked && g.winner && !g.losers.some((l) => l.isMirror),
  );
  if (groups.length === 0) {
    return { ok: true, groups: 0, moved: 0, removed: 0, names: [] };
  }

  const today = formatDate(new Date());
  const allLoserIds = groups.flatMap((g) => g.losers.map((l) => l.id));

  try {
    // Transação interativa (e não a forma em lista) porque são vários
    // comandos por grupo e é preciso conferir o resultado antes de excluir.
    await prisma.$transaction(
      async (tx) => {
        for (const g of groups) {
          const winnerId = g.winner!.id;
          const loserIds = g.losers.map((l) => l.id);
          const where = { supplierId: { in: loserIds } };
          const data = { supplierId: winnerId };
          await tx.vehicle.updateMany({ where, data });
          await tx.part.updateMany({ where, data });
          await tx.payable.updateMany({ where, data });
          await tx.recurringEntry.updateMany({ where, data });
          await tx.purchaseRequest.updateMany({ where, data });

          const audit = `Unificado em ${today}: ${g.losers.map((l) => l.name).join(", ")}.`;
          const notes = [g.enrich.notes ?? g.winner!.data.notes, audit].filter(Boolean).join(" · ");
          await tx.supplier.update({
            where: { id: winnerId },
            data: { ...g.enrich, name: g.survivingName, notes },
          });
        }

        // Trava contra órfão: se alguma tabela ainda apontar para um perdedor
        // (ex.: uma sexta chave estrangeira criada no futuro e esquecida
        // aqui), desfaz tudo em vez de deixar lançamento sem fornecedor.
        const where = { supplierId: { in: allLoserIds } };
        const left = await Promise.all([
          tx.vehicle.count({ where }),
          tx.part.count({ where }),
          tx.payable.count({ where }),
          tx.recurringEntry.count({ where }),
          tx.purchaseRequest.count({ where }),
        ]);
        if (left.some((n) => n > 0)) {
          throw new Error(
            "Ainda há lançamentos ligados aos cadastros que seriam excluídos. Nada foi alterado.",
          );
        }

        await tx.supplier.deleteMany({ where: { id: { in: allLoserIds } } });
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

  // O nome do fornecedor aparece em quase toda tela — revalida o app inteiro.
  revalidatePath("/", "layout");
  revalidatePath("/fornecedores/unificar");

  return {
    ok: true,
    groups: groups.length,
    moved: groups.reduce((sum, g) => sum + g.moved, 0),
    removed: allLoserIds.length,
    names: groups.map((g) => g.survivingName),
  };
}

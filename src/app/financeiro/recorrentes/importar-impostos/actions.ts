"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { resolveSupplierByName } from "@/lib/finance";
import { resolveDespesaCategory } from "@/lib/categories";
import { structuralCenterId } from "@/lib/structural";
import { parseDateInput } from "@/lib/format";
import { applyCompetencia, ensureRecurringGenerated } from "@/lib/recurring";
import { IMPOSTOS_ROWS, IMPOSTOS_START_DATE, IMPOSTOS_DAY_OF_MONTH } from "./data";

export type ImportResult = {
  ok: boolean;
  recurringCreated: number;
  recurringSkipped: number;
  firstTitlesCreated: number;
  generated: number;
  error?: string;
};

/**
 * Cadastra as 3 recorrências de impostos (DAS, FGTS e DARF INSS) — vencimento
 * dia 20, antecipado para o último dia útil, começando em 20/07/2026 — com os
 * fornecedores correspondentes, e lança os títulos da primeira ocorrência
 * (20/07/2026, competência 06/2026). Idempotente: recorrência já existente
 * (mesma descrição) e título já gerado (mesmo vencimento) não duplicam. Só
 * cria títulos PENDENTES — não exige caixa aberto nem farol verde.
 */
export async function importImpostosAction(): Promise<ImportResult> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return {
      ok: false,
      recurringCreated: 0,
      recurringSkipped: 0,
      firstTitlesCreated: 0,
      generated: 0,
      error: e instanceof Error ? e.message : "Sem permissão.",
    };
  }

  const startDate = parseDateInput(IMPOSTOS_START_DATE);
  const center = await structuralCenterId("ADMINISTRATIVO");

  let recurringCreated = 0;
  let recurringSkipped = 0;
  let firstTitlesCreated = 0;

  for (const row of IMPOSTOS_ROWS) {
    const supplierId = await resolveSupplierByName(row.supplier);
    const cat = await resolveDespesaCategory(row.categoryLabel);

    // Recorrência: reaproveita pela descrição (o marcador {competencia} é
    // estável) ou cria.
    let entry = await prisma.recurringEntry.findFirst({
      where: { kind: "PAGAR", description: { equals: row.description, mode: "insensitive" } },
      select: { id: true },
    });
    if (entry) {
      recurringSkipped += 1;
    } else {
      entry = await prisma.recurringEntry.create({
        data: {
          kind: "PAGAR",
          description: row.description,
          amount: row.amount,
          structuralKey: "ADMINISTRATIVO",
          dayOfMonth: IMPOSTOS_DAY_OF_MONTH,
          anticipateToBusinessDay: true,
          categoryPagar: cat.category,
          categoryLabel: cat.label,
          supplierId,
          startDate,
          notes: row.notes,
        },
        select: { id: true },
      });
      recurringCreated += 1;
    }

    // Primeira ocorrência (20/07/2026): o motor mensal só gera mês corrente e
    // seguinte, então a de julho é lançada aqui — sem duplicar.
    const exists = await prisma.payable.findFirst({
      where: {
        recurringId: entry.id,
        dueDate: { gte: new Date("2026-07-01T00:00:00Z"), lt: new Date("2026-08-01T00:00:00Z") },
      },
      select: { id: true },
    });
    if (!exists) {
      await prisma.payable.create({
        data: {
          costCenterId: center,
          description: applyCompetencia(row.description, startDate),
          category: cat.category,
          categoryLabel: cat.label,
          documentNumber: row.firstDoc,
          amount: row.firstAmount ?? row.amount,
          dueDate: startDate,
          status: "PENDENTE",
          supplierId,
          recurringId: entry.id,
          notes: row.firstAmount
            ? row.notes
            : `${row.notes} Valor lançado pela última guia conhecida — confirme o valor da competência 06/2026.`,
        },
      });
      firstTitlesCreated += 1;
    }
  }

  // Puxa também as próximas ocorrências já no horizonte (ex.: 20/08).
  const generated = await ensureRecurringGenerated(45);

  revalidatePath("/financeiro/recorrentes");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/fornecedores");
  revalidatePath("/");
  return { ok: true, recurringCreated, recurringSkipped, firstTitlesCreated, generated };
}

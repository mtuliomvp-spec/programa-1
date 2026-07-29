"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { createManualPayable, resolveSupplierByName } from "@/lib/finance";
import { parseDateInput } from "@/lib/format";
import { PMZ_ROWS, PMZ_SUPPLIER_NAME, normalizePlate } from "./data";

export type ImportResult = {
  ok: boolean;
  created: number;
  skipped: number;
  semPlaca: string[];
  error?: string;
};

/**
 * Cria os títulos da PMZ em Contas a pagar (implantação). Idempotente: pula os
 * que já existem (mesmo documento + fornecedor). Vincula ao veículo pela placa;
 * placa não encontrada entra como conta simples e é reportada.
 */
export async function importPmzTitlesAction(): Promise<ImportResult> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, created: 0, skipped: 0, semPlaca: [], error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const supplierId = await resolveSupplierByName(PMZ_SUPPLIER_NAME);
  const vehicles = await prisma.vehicle.findMany({ select: { id: true, plate: true } });
  const byPlate = new Map(vehicles.map((v) => [normalizePlate(v.plate), v.id]));

  let created = 0;
  let skipped = 0;
  const semPlaca: string[] = [];

  for (const row of PMZ_ROWS) {
    const exists = await prisma.payable.findFirst({
      where: { supplierId, documentNumber: row.doc },
      select: { id: true },
    });
    if (exists) {
      skipped += 1;
      continue;
    }

    const vehicleId = row.plate ? byPlate.get(normalizePlate(row.plate)) ?? null : null;
    if (row.plate && !vehicleId) semPlaca.push(`${row.plate} (NF ${row.doc})`);
    else if (!row.plate) semPlaca.push(`sem placa (NF ${row.doc})`);

    await createManualPayable({
      description: row.description,
      category: "COMPRA_PECA",
      documentNumber: row.doc,
      amount: row.amount,
      dueDate: parseDateInput(row.date),
      supplierId,
      structuralKey: vehicleId ? "VEICULOS" : "ADMINISTRATIVO",
      vehicleId,
      alreadyPaid: false,
    });
    created += 1;
  }

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/estoque");
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
  return { ok: true, created, skipped, semPlaca };
}

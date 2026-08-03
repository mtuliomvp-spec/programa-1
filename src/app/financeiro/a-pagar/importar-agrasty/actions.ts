"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { createExpensePayable, resolveSupplierByName } from "@/lib/finance";
import { parseDateInput } from "@/lib/format";
import { AGRASTY_ROWS, AGRASTY_BENEFICIARY_NAME, AGRASTY_DUE_DATE } from "./data";

export type ImportResult = {
  ok: boolean;
  created: number;
  skipped: number;
  beneficiaryCreated: boolean;
  error?: string;
};

/**
 * Lança os Pix de 31/07 em Contas a pagar com fluxo Capital (saque = Agrasty):
 * cada título nasce PENDENTE, com fornecedor = recebedor do comprovante e
 * capitalBeneficiaryId = Agrasty — a baixa gera a RETIRADA do capital dela.
 * Idempotente: pula os já lançados (mesmo ID Pix no nº do documento). Se o
 * beneficiário Agrasty não existir no Capital, é criado.
 */
export async function importAgrastyTitlesAction(): Promise<ImportResult> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return {
      ok: false,
      created: 0,
      skipped: 0,
      beneficiaryCreated: false,
      error: e instanceof Error ? e.message : "Sem permissão.",
    };
  }

  // Beneficiário do capital "Agrasty": reaproveita pelo nome ou cadastra.
  let beneficiaryCreated = false;
  let beneficiary = await prisma.capitalBeneficiary.findFirst({
    where: { name: { contains: AGRASTY_BENEFICIARY_NAME, mode: "insensitive" } },
    select: { id: true },
  });
  if (!beneficiary) {
    beneficiary = await prisma.capitalBeneficiary.create({
      data: { name: AGRASTY_BENEFICIARY_NAME },
      select: { id: true },
    });
    beneficiaryCreated = true;
  }

  const dueDate = parseDateInput(AGRASTY_DUE_DATE);
  let created = 0;
  let skipped = 0;

  for (const row of AGRASTY_ROWS) {
    // O ID Pix (E2E) é único — se já existe um título com ele, não duplica.
    const exists = await prisma.payable.findFirst({
      where: { documentNumber: row.doc },
      select: { id: true },
    });
    if (exists) {
      skipped += 1;
      continue;
    }

    const supplierId = await resolveSupplierByName(row.supplier);
    await createExpensePayable({
      description: `Pix 31/07/2026 — ${row.supplier}`,
      category: "OUTROS",
      documentNumber: row.doc,
      amount: row.amount,
      dueDate,
      paid: false,
      supplierId,
      capitalBeneficiaryId: beneficiary.id,
      notes: `Pago via ${row.payer} em 31/07/2026 — dar baixa na conta correspondente. Saque do capital da Agrasty na baixa.`,
    });
    created += 1;
  }

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/capital");
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
  return { ok: true, created, skipped, beneficiaryCreated };
}

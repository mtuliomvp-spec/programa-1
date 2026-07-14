"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createCashEntry, deleteCashEntry, resolveSupplierByName } from "@/lib/finance";
import { parseDateInput } from "@/lib/format";
import type { CategoriaPagar } from "@prisma/client";

const schema = z.object({
  kind: z.enum(["entrada", "saida"]),
  description: z.string().min(1, "Informe a descrição"),
  amount: z.coerce.number().min(0.01, "Informe um valor válido"),
  date: z.string().min(1, "Informe a data"),
  accountId: z.string().min(1, "Escolha a conta"),
  categoryLabel: z.string().optional(),
  structuralKey: z.enum(["CAPITAL", "VEICULOS", "ADMINISTRATIVO"]).optional(),
  supplierName: z.string().optional(),
  vehicleId: z.string().optional(),
  customerId: z.string().optional(),
  capitalBeneficiaryId: z.string().optional(),
  notes: z.string().optional(),
});

export type CashEntryState = { error?: string; ok?: boolean };

// Rótulos "de fábrica" já mapeados para uma categoria contábil do enum.
const KNOWN: Record<string, CategoriaPagar> = {
  outros: "OUTROS",
  "despesa operacional": "DESPESA_OPERACIONAL",
  comissão: "COMISSAO",
  comissao: "COMISSAO",
  salário: "SALARIO",
  salario: "SALARIO",
  combustível: "COMBUSTIVEL",
  combustivel: "COMBUSTIVEL",
};

function mapCategory(label?: string): CategoriaPagar {
  return KNOWN[(label || "").trim().toLowerCase()] || "OUTROS";
}

export async function createCashEntryAction(
  _prev: CashEntryState,
  formData: FormData,
): Promise<CashEntryState> {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  const label = d.kind === "saida" ? (d.categoryLabel || "").trim() : "";
  const isCapital = d.structuralKey === "CAPITAL";
  const supplierName = (d.supplierName || "").trim();

  // Toda saída precisa de categoria; e de fornecedor (ou, no Capital, do
  // beneficiário do capital).
  if (d.kind === "saida") {
    if (!label) return { error: "Informe a categoria do lançamento." };
    if (isCapital && !d.capitalBeneficiaryId) {
      return { error: "Escolha o beneficiário do capital." };
    }
    if (!supplierName) {
      return { error: "Informe o fornecedor do lançamento." };
    }
  } else if (isCapital && !d.capitalBeneficiaryId) {
    // Entrada no Capital = aporte: precisa do beneficiário.
    return { error: "Escolha o beneficiário do capital (aporte)." };
  }

  // Categoria nova (não é uma das padrão) é cadastrada para reaproveitar.
  if (label && !KNOWN[label.toLowerCase()]) {
    await prisma.launchCategory.upsert({
      where: { name: label },
      update: {},
      create: { name: label },
    });
  }

  // Fornecedor: reaproveita ou cadastra pelo nome (ex.: o banco da tarifa).
  // Também no Capital — pode-se pagar a um fornecedor por conta do beneficiário.
  const supplierId =
    d.kind === "saida" && supplierName ? await resolveSupplierByName(supplierName) : null;

  await createCashEntry({
    kind: d.kind,
    description: d.description,
    amount: d.amount,
    date: parseDateInput(d.date),
    accountId: d.accountId,
    category: d.kind === "saida" ? mapCategory(label) : undefined,
    categoryLabel: d.kind === "saida" && label ? label : null,
    structuralKey: d.structuralKey,
    supplierId,
    vehicleId: d.structuralKey === "VEICULOS" ? d.vehicleId || null : null,
    customerId: d.kind === "entrada" ? d.customerId || null : null,
    capitalBeneficiaryId: isCapital ? d.capitalBeneficiaryId || null : null,
    notes: d.notes || null,
  });

  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/estoque");
  revalidatePath("/capital");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteCashEntryAction(kind: "entrada" | "saida", id: string) {
  await deleteCashEntry(kind, id);
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/estoque");
  revalidatePath("/");
}

"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createCashEntry, deleteCashEntry } from "@/lib/finance";
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
  supplierId: z.string().optional(),
  vehicleId: z.string().optional(),
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

  // Categoria nova (não é uma das padrão) é cadastrada para reaproveitar.
  if (label && !KNOWN[label.toLowerCase()]) {
    await prisma.launchCategory.upsert({
      where: { name: label },
      update: {},
      create: { name: label },
    });
  }

  await createCashEntry({
    kind: d.kind,
    description: d.description,
    amount: d.amount,
    date: parseDateInput(d.date),
    accountId: d.accountId,
    category: d.kind === "saida" ? mapCategory(label) : undefined,
    categoryLabel: d.kind === "saida" && label ? label : null,
    structuralKey: d.structuralKey,
    supplierId: d.kind === "saida" ? d.supplierId || null : null,
    vehicleId: d.kind === "saida" && d.structuralKey === "VEICULOS" ? d.vehicleId || null : null,
    notes: d.notes || null,
  });

  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/estoque");
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

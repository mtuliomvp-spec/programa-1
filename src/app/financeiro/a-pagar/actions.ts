"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { markPayablePaid, markPayablePending, createManualPayable, resolveSupplierByName, splitInstallments, addMonths, addDays } from "@/lib/finance";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen } from "@/lib/cashbox";
import { assertCan } from "@/lib/guards";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { parseDateInput } from "@/lib/format";

export async function markPaidAction(id: string, accountId?: string) {
  await assertCan("financeiro", "pagar");
  await assertBooksBalanced();
  await assertCashboxOpen();
  await markPayablePaid(id, new Date(), accountId || null);
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
}

export type PayBatchResult = { ok: boolean; paid: number; error?: string };

/**
 * Baixa um ou vários títulos de uma vez pela conta escolhida (pagamento em
 * lote, como na Agrasty). A data padrão é hoje; se informada, usa a data dada.
 */
export async function payBatchAction(
  ids: string[],
  accountId: string,
  dateInput?: string,
): Promise<PayBatchResult> {
  if (!ids.length) return { ok: false, paid: 0, error: "Selecione ao menos um título." };
  if (!accountId) return { ok: false, paid: 0, error: "Escolha a conta que fará o pagamento." };
  try {
    await assertCan("financeiro", "pagar");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { ok: false, paid: 0, error: e instanceof Error ? e.message : "Bloqueado." };
  }
  const date = dateInput ? parseDateInput(dateInput) : new Date();
  try {
    await assertMonthOpen(date);
  } catch (e) {
    return { ok: false, paid: 0, error: e instanceof Error ? e.message : "Mês fechado." };
  }
  let paid = 0;
  for (const id of ids) {
    await markPayablePaid(id, date, accountId);
    paid += 1;
  }
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/");
  return { ok: true, paid };
}

/**
 * Define (ou corrige) o fornecedor de um título já lançado. Metadado puro —
 * não mexe em valores, status nem saldos. Serve para consertar contas antigas
 * lançadas sem fornecedor (ex.: compra concluída sem fornecedor sugerido).
 */
export async function setPayableSupplierAction(
  id: string,
  supplierId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("financeiro", "criar");
    await prisma.payable.update({
      where: { id },
      data: { supplierId: supplierId || null },
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível salvar." };
  }
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/livro-caixa");
  return { ok: true };
}

export async function markPendingAction(id: string) {
  await assertCan("financeiro", "pagar");
  await markPayablePending(id);
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/");
}

const manualSchema = z.object({
  description: z.string().min(1, "Informe a descrição"),
  categoryLabel: z.string().optional(),
  documentNumber: z.string().optional(),
  amount: z.coerce.number().min(0.01, "Informe um valor válido"),
  dueDate: z.string().min(1),
  // À vista (título único) ou parcelado em N vezes.
  paymentMode: z.enum(["A_VISTA", "PARCELADO"]).default("A_VISTA"),
  installmentsCount: z.coerce.number().int().min(0).default(0),
  // Vencimentos do parcelado: MENSAL (todo mês, mesmo dia) ou a cada X DIAS.
  installmentPeriod: z.enum(["MENSAL", "DIAS"]).default("MENSAL"),
  installmentDays: z.coerce.number().int().min(1).default(30),
  supplierName: z.string().optional(),
  costCenterId: z.string().optional(),
  structuralKey: z.enum(["CAPITAL", "VEICULOS", "ADMINISTRATIVO"]).optional(),
  vehicleId: z.string().optional(),
  capitalBeneficiaryId: z.string().optional(),
  notes: z.string().optional(),
  alreadyPaid: z.coerce.boolean().optional(),
});

const KNOWN_CATEGORIES: Record<string, "DESPESA_OPERACIONAL" | "COMISSAO" | "SALARIO" | "COMBUSTIVEL" | "OUTROS"> = {
  outros: "OUTROS",
  "despesa operacional": "DESPESA_OPERACIONAL",
  comissão: "COMISSAO",
  comissao: "COMISSAO",
  salário: "SALARIO",
  salario: "SALARIO",
  combustível: "COMBUSTIVEL",
  combustivel: "COMBUSTIVEL",
};

export type ManualPayableState = { error?: string };

export async function createManualPayableAction(
  _prev: ManualPayableState,
  formData: FormData,
): Promise<ManualPayableState> {
  try {
    await assertCan("financeiro", "criar");
    await assertBooksBalanced();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const parsed = manualSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;
  try {
    // Título PENDENTE não movimenta dinheiro — pode ser criado com o caixa
    // fechado. O caixa aberto só é exigido quando "já foi pago" (baixa junto).
    if (d.paymentMode === "A_VISTA" && d.alreadyPaid) await assertCashboxOpen();
    await assertMonthOpen(parseDateInput(d.dueDate));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }

  const label = (d.categoryLabel || "").trim();
  const isCapital = d.structuralKey === "CAPITAL";
  const supplierName = (d.supplierName || "").trim();

  // Toda conta precisa de categoria; e de fornecedor (ou, no Capital, do
  // beneficiário do capital).
  if (!label) return { error: "Informe a categoria." };
  if (isCapital && !d.capitalBeneficiaryId) return { error: "Escolha o beneficiário do capital." };
  if (!supplierName) return { error: "Informe o fornecedor." };

  // Categoria nova é cadastrada para reaproveitar.
  if (!KNOWN_CATEGORIES[label.toLowerCase()]) {
    await prisma.launchCategory.upsert({ where: { name: label }, update: {}, create: { name: label } });
  }

  // Parcelamento: N títulos mensais a partir do 1º vencimento. "Já foi pago"
  // só vale à vista (parcelas futuras nascem pendentes).
  const parcelado = d.paymentMode === "PARCELADO";
  const count = parcelado ? d.installmentsCount : 1;
  if (parcelado && count < 2) return { error: "Informe o número de parcelas (2 ou mais)." };

  // Fornecedor: reaproveita ou cadastra pelo nome (ex.: o banco da tarifa).
  // Também no Capital — pode-se pagar a um fornecedor por conta do beneficiário.
  const supplierId = await resolveSupplierByName(supplierName);

  const firstDue = parseDateInput(d.dueDate);
  const amounts = count > 1 ? splitInstallments(d.amount, count) : [d.amount];
  for (let i = 0; i < amounts.length; i++) {
    await createManualPayable({
      description: count > 1 ? `${d.description} - Parcela ${i + 1}/${count}` : d.description,
      category: KNOWN_CATEGORIES[label.toLowerCase()] || "OUTROS",
      categoryLabel: label,
      documentNumber: d.documentNumber?.trim() || null,
      amount: amounts[i],
      dueDate:
        d.installmentPeriod === "DIAS"
          ? addDays(firstDue, i * d.installmentDays)
          : addMonths(firstDue, i),
      supplierId,
      costCenterId: isCapital ? null : d.costCenterId || null,
      structuralKey: d.structuralKey,
      vehicleId: d.structuralKey === "VEICULOS" ? d.vehicleId || null : null,
      capitalBeneficiaryId: isCapital ? d.capitalBeneficiaryId || null : null,
      notes: d.notes || null,
      alreadyPaid: !parcelado && Boolean(d.alreadyPaid),
    });
  }

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/estoque");
  revalidatePath("/capital");
  revalidatePath("/");
  redirect("/financeiro/a-pagar");
}

"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCanAny } from "@/lib/guards";
import { syncCardInvoiceDerived } from "@/lib/card-invoice";
import { classifyCardCharge, resolveBeneficiaryIds } from "@/lib/card-flow";
import { extractFaturaFromPdf } from "@/lib/fatura-ai";

/**
 * Lançamentos da fatura de cartão (itens dentro de um título cardInvoice).
 * Só título NÃO pago pode ser alterado (pago → reverter antes, como na edição).
 * Toda mudança re-sincroniza: valor do título = soma dos itens; item VEICULOS
 * com carro vira custo do veículo; item CAPITAL com sócio vira retirada na baixa.
 */

export type CardItemFormState = { error?: string };

const itemSchema = z.object({
  payableId: z.string().min(1),
  description: z.string().min(1, "Descreva o lançamento (como está na fatura)"),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  structuralKey: z.enum(["ADMINISTRATIVO", "VEICULOS", "CAPITAL"]).default("ADMINISTRATIVO"),
  vehicleId: z.string().optional(),
  capitalBeneficiaryId: z.string().optional(),
});

async function guardPayable(payableId: string): Promise<string | null> {
  const payable = await prisma.payable.findUnique({
    where: { id: payableId },
    select: { cardInvoice: true, status: true },
  });
  if (!payable) return "Título não encontrado.";
  if (!payable.cardInvoice) return "Este título não é uma fatura de cartão.";
  if (payable.status === "PAGO") return "Fatura já paga — reverta a baixa antes de alterar os lançamentos.";
  return null;
}

function revalidateAll() {
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/recorrentes");
  revalidatePath("/estoque");
  revalidatePath("/capital");
  revalidatePath("/");
}

export async function addCardItemAction(
  _prev: CardItemFormState,
  formData: FormData,
): Promise<CardItemFormState> {
  try {
    await assertCanAny([
      ["financeiro", "criar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = itemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  const guardError = await guardPayable(d.payableId);
  if (guardError) return { error: guardError };

  if (d.structuralKey === "CAPITAL" && !d.capitalBeneficiaryId) {
    return { error: "Escolha o sócio (beneficiário) do lançamento no Capital." };
  }

  await prisma.cardInvoiceItem.create({
    data: {
      payableId: d.payableId,
      description: d.description.trim(),
      amount: d.amount,
      structuralKey: d.structuralKey,
      vehicleId: d.structuralKey === "VEICULOS" ? d.vehicleId || null : null,
      capitalBeneficiaryId: d.structuralKey === "CAPITAL" ? d.capitalBeneficiaryId || null : null,
    },
  });
  await syncCardInvoiceDerived(d.payableId);
  revalidateAll();
  return {};
}

const updateItemSchema = itemSchema.omit({ payableId: true }).extend({ itemId: z.string().min(1) });

/** Edita um lançamento da fatura (descrição, valor e fluxo) e re-sincroniza tudo. */
export async function updateCardItemAction(formData: FormData): Promise<CardItemFormState> {
  try {
    await assertCanAny([
      ["financeiro", "criar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = updateItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  const item = await prisma.cardInvoiceItem.findUnique({
    where: { id: d.itemId },
    select: { payableId: true },
  });
  if (!item) return { error: "Lançamento não encontrado." };
  const guardError = await guardPayable(item.payableId);
  if (guardError) return { error: guardError };

  if (d.structuralKey === "CAPITAL" && !d.capitalBeneficiaryId) {
    return { error: "Escolha o sócio (beneficiário) do lançamento no Capital." };
  }

  await prisma.cardInvoiceItem.update({
    where: { id: d.itemId },
    data: {
      description: d.description.trim(),
      amount: d.amount,
      structuralKey: d.structuralKey,
      vehicleId: d.structuralKey === "VEICULOS" ? d.vehicleId || null : null,
      capitalBeneficiaryId: d.structuralKey === "CAPITAL" ? d.capitalBeneficiaryId || null : null,
    },
  });
  await syncCardInvoiceDerived(item.payableId);
  revalidateAll();
  return {};
}

export async function deleteCardItemAction(itemId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCanAny([
      ["financeiro", "criar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const item = await prisma.cardInvoiceItem.findUnique({
    where: { id: itemId },
    select: { payableId: true },
  });
  if (!item) return { ok: false, error: "Lançamento não encontrado." };
  const guardError = await guardPayable(item.payableId);
  if (guardError) return { ok: false, error: guardError };

  // O custo do veículo e a retirada vinculados caem junto (cascade 1:1).
  await prisma.cardInvoiceItem.delete({ where: { id: itemId } });
  await syncCardInvoiceDerived(item.payableId);
  revalidateAll();
  return { ok: true };
}

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB (mesmo limite dos demais anexos)
const round2 = (n: number) => Math.round(n * 100) / 100;

export type ImportPdfResult = {
  ok: boolean;
  itemsCreated: number;
  total: number;
  faturaTotal: number;
  warning?: string;
  error?: string;
};

/**
 * Importa a fatura do cartão em PDF via IA: extrai os lançamentos (IOF somado
 * na linha, pagamentos/créditos ignorados), aplica as regras de fluxo do
 * Capital (Lovable/Anthropic → Agrasty; cartão 9792 → Marcelo; resto → Marco
 * Túlio), cria os itens no título e anexa o PDF. Só em título de fatura NÃO
 * pago e ainda SEM lançamentos (para não duplicar) — depois é só revisar e
 * editar linha a linha.
 */
export async function importCardInvoicePdfAction(formData: FormData): Promise<ImportPdfResult> {
  const fail = (error: string): ImportPdfResult => ({
    ok: false,
    itemsCreated: 0,
    total: 0,
    faturaTotal: 0,
    error,
  });
  try {
    await assertCanAny([
      ["financeiro", "criar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Sem permissão.");
  }

  const payableId = String(formData.get("payableId") || "");
  const guardError = await guardPayable(payableId);
  if (guardError) return fail(guardError);

  const existing = await prisma.cardInvoiceItem.count({ where: { payableId } });
  if (existing > 0) {
    return fail(
      "Este título já tem lançamentos. Exclua-os (ou lance manualmente) antes de importar o PDF — a importação não mistura com o que já foi digitado.",
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Anexe o PDF da fatura.");
  if (file.size > MAX_PDF_BYTES) return fail("Arquivo muito grande (máximo 15 MB).");
  if (!(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) {
    return fail("Envie o arquivo PDF da fatura.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdfBase64 = Buffer.from(bytes).toString("base64");

  let fatura;
  try {
    fatura = await extractFaturaFromPdf(pdfBase64);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Não foi possível ler a fatura.");
  }

  const beneficiaryIds = await resolveBeneficiaryIds();
  const rows = fatura.lancamentos
    .map((l) => ({ ...l, valor: round2(l.valor) }))
    .filter((l) => l.valor > 0);
  if (rows.length === 0) return fail("Nenhum lançamento com valor válido foi encontrado no PDF.");

  await prisma.cardInvoiceItem.createMany({
    data: rows.map((l) => ({
      payableId,
      description: `${l.data} ${l.descricao}${l.parcela ? ` — parc. ${l.parcela}` : ""} · cartão ${
        l.cartao_final || "?"
      }${l.portador ? ` ${l.portador}` : ""}`,
      amount: l.valor,
      structuralKey: "CAPITAL",
      capitalBeneficiaryId: beneficiaryIds[classifyCardCharge(l.descricao, l.cartao_final)],
    })),
  });

  // Guarda o PDF junto do título (auditoria/conferência).
  await prisma.payableAttachment.create({
    data: {
      payableId,
      description: "Fatura do cartão (PDF importado via IA)",
      filename: file.name || "fatura.pdf",
      mimeType: "application/pdf",
      size: bytes.byteLength,
      data: bytes,
    },
  });

  await syncCardInvoiceDerived(payableId);
  revalidateAll();

  const total = round2(rows.reduce((s, l) => s + l.valor, 0));
  const faturaTotal = round2(fatura.total_a_pagar);
  const diff = round2(Math.abs(total - faturaTotal));
  return {
    ok: true,
    itemsCreated: rows.length,
    total,
    faturaTotal,
    warning:
      diff > 0.01
        ? `A soma dos lançamentos (${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) difere do total da fatura (${faturaTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) — normal quando houve pagamento parcial/saldo anterior, mas confira linha a linha antes de pagar.`
        : undefined,
  };
}

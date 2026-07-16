"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  addVehicleCostWithPayable,
  createVehicleWithPayable,
  deleteVehicleCost,
  receiveVehicleAdvance,
} from "@/lib/finance";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen } from "@/lib/cashbox";
import { parseDateInput } from "@/lib/format";

const advanceSchema = z.object({
  vehicleId: z.string().min(1),
  amount: z.coerce.number().min(0.01, "Informe o valor do sinal"),
  date: z.string().min(1),
  accountId: z.string().optional(),
  customerId: z.string().optional(),
});

export type AdvanceFormState = { error?: string; success?: string };

export async function receiveVehicleAdvanceAction(
  _prev: AdvanceFormState,
  formData: FormData,
): Promise<AdvanceFormState> {
  try {
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const parsed = advanceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;
  try {
    await receiveVehicleAdvance({
      vehicleId: d.vehicleId,
      amount: d.amount,
      date: parseDateInput(d.date),
      accountId: d.accountId || null,
      customerId: d.customerId || null,
    });
  } catch {
    return { error: "Não foi possível receber o sinal." };
  }
  revalidatePath(`/estoque/${d.vehicleId}`);
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/");
  return { success: "Sinal recebido." };
}

export async function deleteVehicleAdvanceAction(id: string, vehicleId: string) {
  // Só remove sinal ainda não vinculado a uma venda.
  await prisma.receivable.deleteMany({ where: { id, saleId: null, vehicleId } });
  revalidatePath(`/estoque/${vehicleId}`);
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
}

const vehicleSchema = z.object({
  brand: z.string().min(1, "Informe a marca"),
  model: z.string().min(1, "Informe o modelo"),
  version: z.string().optional(),
  manufactureYear: z.coerce.number().int().min(1950).max(2100),
  modelYear: z.coerce.number().int().min(1950).max(2100),
  plate: z.string().min(1, "Informe a placa"),
  chassi: z.string().optional(),
  color: z.string().optional(),
  km: z.coerce.number().int().min(0).default(0),
  fuel: z.string().optional(),
  transmission: z.string().optional(),
  purchasePrice: z.coerce.number().min(0),
  salePrice: z.coerce.number().min(0),
  entryDate: z.string().min(1),
  notes: z.string().optional(),
  supplierId: z.string().optional(),
  alreadyPaid: z.coerce.boolean().optional(),
  dueDate: z.string().optional(),
  acquisitionType: z.enum(["A_VISTA", "PARCELADO", "FINANCIADO", "CONSORCIO"]).optional(),
  downPayment: z.coerce.number().min(0).optional(),
  installmentsCount: z.coerce.number().int().min(1).max(120).optional(),
  financerName: z.string().optional(),
  payoffAmount: z.coerce.number().min(0).optional(),
  payoffTo: z.string().optional(),
  debtsAmount: z.coerce.number().min(0).optional(),
});

export type VehicleFormState = { error?: string };

export async function createVehicleAction(
  _prevState: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  try {
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const raw = Object.fromEntries(formData.entries());
  const parsed = vehicleSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const data = parsed.data;

  const existing = await prisma.vehicle.findUnique({ where: { plate: data.plate.toUpperCase() } });
  if (existing) {
    return { error: "Já existe um veículo cadastrado com essa placa." };
  }

  try {
    const vehicle = await createVehicleWithPayable({
      brand: data.brand,
      model: data.model,
      version: data.version || null,
      manufactureYear: data.manufactureYear,
      modelYear: data.modelYear,
      plate: data.plate.toUpperCase(),
      chassi: data.chassi || null,
      color: data.color || null,
      km: data.km,
      fuel: data.fuel || null,
      transmission: data.transmission || null,
      purchasePrice: data.purchasePrice,
      salePrice: data.salePrice,
      entryDate: parseDateInput(data.entryDate),
      notes: data.notes || null,
      supplierId: data.supplierId || null,
      alreadyPaid: Boolean(data.alreadyPaid),
      dueDate: data.dueDate ? parseDateInput(data.dueDate) : null,
      acquisitionType: data.acquisitionType ?? "A_VISTA",
      downPayment: data.downPayment ?? 0,
      installmentsCount: data.installmentsCount ?? 1,
      financerName: data.financerName || null,
      payoffAmount: data.payoffAmount ?? 0,
      payoffTo: data.payoffTo || null,
      debtsAmount: data.debtsAmount ?? 0,
    });
    revalidatePath("/estoque");
    revalidatePath("/financeiro/a-pagar");
    revalidatePath("/");
    redirect(`/estoque/${vehicle.id}`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    return { error: "Não foi possível salvar o veículo. Tente novamente." };
  }
  return {};
}

const updateSchema = vehicleSchema.extend({ id: z.string().min(1) });

export async function updateVehicleAction(
  _prevState: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const data = parsed.data;

  const existing = await prisma.vehicle.findUnique({ where: { plate: data.plate.toUpperCase() } });
  if (existing && existing.id !== data.id) {
    return { error: "Já existe outro veículo cadastrado com essa placa." };
  }

  try {
    await prisma.vehicle.update({
      where: { id: data.id },
      data: {
        brand: data.brand,
        model: data.model,
        version: data.version || null,
        manufactureYear: data.manufactureYear,
        modelYear: data.modelYear,
        plate: data.plate.toUpperCase(),
        chassi: data.chassi || null,
        color: data.color || null,
        km: data.km,
        fuel: data.fuel || null,
        transmission: data.transmission || null,
        purchasePrice: data.purchasePrice,
        salePrice: data.salePrice,
        acquisitionType: data.acquisitionType ?? "A_VISTA",
        downPayment: data.downPayment ?? 0,
        installmentsCount: data.installmentsCount ?? 1,
        financerName: data.financerName || null,
        payoffAmount: data.payoffAmount ?? 0,
        payoffTo: data.payoffTo || null,
        debtsAmount: data.debtsAmount ?? 0,
        entryDate: parseDateInput(data.entryDate),
        notes: data.notes || null,
        supplierId: data.supplierId || null,
      },
    });

    // Regenera as contas a pagar da compra conforme a forma de aquisição,
    // desde que nenhuma parcela da compra já tenha sido paga (senão mantém
    // o que existe para não bagunçar o que já foi liquidado).
    const { regenerateVehicleAcquisitionPayables } = await import("@/lib/finance");
    await regenerateVehicleAcquisitionPayables(data.id);

    revalidatePath("/estoque");
    revalidatePath(`/estoque/${data.id}`);
    revalidatePath("/financeiro/a-pagar");
    revalidatePath("/");
  } catch {
    return { error: "Não foi possível atualizar o veículo." };
  }
  redirect(`/estoque/${data.id}`);
}

export async function setVehicleStatusAction(id: string, status: "ESTOQUE" | "RESERVADO") {
  await prisma.vehicle.update({ where: { id }, data: { status } });
  revalidatePath("/estoque");
  revalidatePath(`/estoque/${id}`);
  revalidatePath("/");
}

export async function lookupPlateAction(plate: string) {
  const { lookupPlate } = await import("@/lib/plate-lookup");
  return lookupPlate(plate);
}

export async function fetchVehicleDebtsAction(vehicleId: string) {
  const vehicle = await prisma.vehicle.findUniqueOrThrow({
    where: { id: vehicleId },
    select: { plate: true },
  });
  const { lookupVehicleDebts } = await import("@/lib/debts-lookup");
  return lookupVehicleDebts(vehicle.plate);
}

export async function importVehicleDebtsAction(
  vehicleId: string,
  debts: { category: "IPVA" | "MULTA" | "LICENCIAMENTO"; description: string; amount: number; dueDate: string }[],
): Promise<{ imported: number }> {
  let imported = 0;
  for (const debt of debts.slice(0, 50)) {
    if (!debt.amount || debt.amount <= 0) continue;
    await addVehicleCostWithPayable({
      vehicleId,
      description: debt.description.slice(0, 180),
      category: debt.category,
      amount: debt.amount,
      date: new Date(),
      alreadyPaid: false,
      dueDate: parseDateInput(debt.dueDate),
      installments: 1,
      notes: "Importado da consulta de débitos (API Placas)",
    });
    imported++;
  }
  revalidatePath(`/estoque/${vehicleId}`);
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
  return { imported };
}

const costSchema = z.object({
  vehicleId: z.string().min(1),
  description: z.string().min(1, "Descreva o custo"),
  category: z.enum([
    "PREPARACAO",
    "DOCUMENTACAO",
    "MECANICA",
    "FUNILARIA_PINTURA",
    "ESTETICA",
    "FRETE",
    "IPVA",
    "MULTA",
    "LICENCIAMENTO",
    "OUTROS",
  ]),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  date: z.string().min(1),
  alreadyPaid: z.coerce.boolean().optional(),
  dueDate: z.string().optional(),
  installments: z.coerce.number().int().min(1).max(60).optional(),
});

export type CostFormState = { error?: string; success?: boolean };

export async function addVehicleCostAction(
  _prevState: CostFormState,
  formData: FormData,
): Promise<CostFormState> {
  try {
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const parsed = costSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const data = parsed.data;

  try {
    await addVehicleCostWithPayable({
      vehicleId: data.vehicleId,
      description: data.description,
      category: data.category,
      amount: data.amount,
      date: parseDateInput(data.date),
      alreadyPaid: Boolean(data.alreadyPaid),
      dueDate: data.dueDate ? parseDateInput(data.dueDate) : null,
      installments: data.installments ?? 1,
    });
  } catch {
    return { error: "Não foi possível lançar o custo. Tente novamente." };
  }
  revalidatePath(`/estoque/${data.vehicleId}`);
  revalidatePath("/estoque");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
  return { success: true };
}

export async function deleteVehicleCostAction(costId: string, vehicleId: string) {
  await deleteVehicleCost(costId);
  revalidatePath(`/estoque/${vehicleId}`);
  revalidatePath("/estoque");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Documentos anexados ao veículo (ex.: Comunicação de venda)
// ---------------------------------------------------------------------------

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB

export type AttachmentState = { error?: string; ok?: boolean };

export async function uploadVehicleAttachmentAction(
  _prev: AttachmentState,
  formData: FormData,
): Promise<AttachmentState> {
  const { getSessionUser } = await import("@/lib/auth");
  const user = await getSessionUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  const vehicleId = String(formData.get("vehicleId") || "").trim();
  const description = String(formData.get("description") || "").trim() || "Comunicação de venda";
  const file = formData.get("file");
  if (!vehicleId) return { error: "Veículo inválido." };
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo." };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { error: "Arquivo muito grande (máximo 15 MB)." };
  }

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
  if (!vehicle) return { error: "Veículo não encontrado." };

  const buffer = Buffer.from(await file.arrayBuffer());
  await prisma.vehicleAttachment.create({
    data: {
      vehicleId,
      description,
      filename: file.name || "documento",
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      data: buffer,
    },
  });
  revalidatePath(`/estoque/${vehicleId}`);
  return { ok: true };
}

export async function deleteVehicleAttachmentAction(id: string, vehicleId: string) {
  await prisma.vehicleAttachment.deleteMany({ where: { id, vehicleId } });
  revalidatePath(`/estoque/${vehicleId}`);
  revalidatePath("/estoque");
}

/** Coordenada válida ou null (aceita string vazia / fora de faixa → null). */
function parseCoord(value: FormDataEntryValue | null, max: number): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > max) return null;
  return n;
}

/**
 * Anexa a "Foto do cliente" (antifraude) ao prontuário do veículo, com a
 * geolocalização do momento da captura. Mesma tabela dos documentos, então já
 * aparece na listagem e entra no backup. A imagem já vem carimbada do cliente.
 */
export async function uploadClientPhotoAction(
  _prev: AttachmentState,
  formData: FormData,
): Promise<AttachmentState> {
  const { getSessionUser } = await import("@/lib/auth");
  const user = await getSessionUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  const vehicleId = String(formData.get("vehicleId") || "").trim();
  const description = String(formData.get("description") || "").trim() || "Foto do cliente (comprador)";
  const file = formData.get("file");
  if (!vehicleId) return { error: "Veículo inválido." };
  if (!(file instanceof File) || file.size === 0) return { error: "Tire ou selecione uma foto." };
  if (!file.type.startsWith("image/")) return { error: "O anexo precisa ser uma imagem." };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { error: "Foto muito grande (máximo 15 MB)." };
  }

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
  if (!vehicle) return { error: "Veículo não encontrado." };

  const latitude = parseCoord(formData.get("latitude"), 90);
  const longitude = parseCoord(formData.get("longitude"), 180);
  const geoAccuracy = parseCoord(formData.get("geoAccuracy"), Number.MAX_SAFE_INTEGER);
  const address = String(formData.get("address") || "").trim().slice(0, 300) || null;

  const buffer = Buffer.from(await file.arrayBuffer());
  await prisma.vehicleAttachment.create({
    data: {
      vehicleId,
      kind: "FOTO_CLIENTE",
      description,
      filename: file.name || "foto-cliente.jpg",
      mimeType: file.type || "image/jpeg",
      size: file.size,
      data: buffer,
      latitude,
      longitude,
      geoAccuracy,
      address,
    },
  });
  revalidatePath(`/estoque/${vehicleId}`);
  revalidatePath("/estoque");
  revalidatePath("/vendas");
  return { ok: true };
}

export async function deleteVehicleAction(id: string) {
  const sale = await prisma.sale.findFirst({ where: { vehicleId: id, status: { not: "CANCELADA" } } });
  if (sale) {
    throw new Error("Não é possível excluir um veículo que já possui venda registrada.");
  }
  // Remove tudo que depende do veículo para a exclusão não falhar por vínculo
  // (custos, adiantamentos/recebíveis, contas a pagar).
  await prisma.vehicleCost.deleteMany({ where: { vehicleId: id } });
  await prisma.receivable.deleteMany({ where: { vehicleId: id } });
  await prisma.payable.deleteMany({ where: { vehicleId: id } });
  await prisma.vehicle.delete({ where: { id } });
  revalidatePath("/estoque");
  revalidatePath("/");
  redirect("/estoque");
}

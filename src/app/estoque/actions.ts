"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  addVehicleCostWithPayable,
  createVehicleWithPayable,
  deleteVehicleCost,
} from "@/lib/finance";
import { parseDateInput } from "@/lib/format";

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

export async function deleteVehicleAction(id: string) {
  const sale = await prisma.sale.findUnique({ where: { vehicleId: id } });
  if (sale) {
    throw new Error("Não é possível excluir um veículo que já possui venda registrada.");
  }
  await prisma.payable.deleteMany({ where: { vehicleId: id } });
  await prisma.vehicle.delete({ where: { id } });
  revalidatePath("/estoque");
  revalidatePath("/");
  redirect("/estoque");
}

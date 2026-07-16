"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { structuralCenterId } from "@/lib/structural";
import { parseDateInput } from "@/lib/format";
import { getDefaultAccountId } from "@/lib/accounts";
import { assertBooksBalanced } from "@/lib/books-health";

const fuelSchema = z.object({
  date: z.string().min(1),
  vehicleId: z.string().optional(),
  plate: z.string().optional(),
  driver: z.string().optional(),
  station: z.string().optional(),
  fuelType: z.string().optional(),
  liters: z.coerce.number().positive("Informe os litros"),
  pricePerLiter: z.coerce.number().positive("Informe o preço por litro"),
  km: z.coerce.number().int().min(0).optional(),
  notes: z.string().optional(),
  alreadyPaid: z.coerce.boolean().optional(),
});

export type FuelFormState = { error?: string };

export async function createFuelEntryAction(
  _prev: FuelFormState,
  formData: FormData,
): Promise<FuelFormState> {
  try {
    await assertBooksBalanced();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const parsed = fuelSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const data = parsed.data;

  if (!data.vehicleId && !data.plate?.trim()) {
    return { error: "Informe o veículo ou a placa." };
  }

  const date = parseDateInput(data.date);
  const total = Math.round(data.liters * data.pricePerLiter * 100) / 100;
  const defaultAccountId = data.alreadyPaid ? await getDefaultAccountId() : null;

  try {
    // Combustível de um veículo específico é custo daquele veículo → centro
    // Veículos. Sem veículo (frota geral/placa avulsa) → Administrativo.
    const centerId = await structuralCenterId(data.vehicleId ? "VEICULOS" : "ADMINISTRATIVO");
    await prisma.$transaction(async (tx) => {
      let plate = data.plate?.trim().toUpperCase() || null;
      if (data.vehicleId) {
        const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id: data.vehicleId } });
        plate = vehicle.plate;
      }

      const paid = Boolean(data.alreadyPaid);
      const payable = await tx.payable.create({
        data: {
          costCenterId: centerId,
          description: `Combustível ${plate}${data.station ? ` - ${data.station}` : ""}`,
          category: "COMBUSTIVEL",
          amount: total,
          dueDate: date,
          paymentDate: paid ? date : null,
          status: paid ? "PAGO" : "PENDENTE",
          vehicleId: data.vehicleId || null,
          accountId: paid ? defaultAccountId : null,
          notes: data.notes || null,
        },
      });

      await tx.fuelEntry.create({
        data: {
          date,
          vehicleId: data.vehicleId || null,
          plate,
          driver: data.driver || null,
          station: data.station || null,
          fuelType: data.fuelType || null,
          liters: data.liters,
          pricePerLiter: data.pricePerLiter,
          total,
          km: data.km ?? null,
          notes: data.notes || null,
          payableId: payable.id,
        },
      });
    });
  } catch {
    return { error: "Não foi possível registrar o abastecimento." };
  }
  revalidatePath("/combustiveis");
  revalidatePath("/financeiro/a-pagar");
  return {};
}

export async function deleteFuelEntryAction(id: string) {
  await prisma.$transaction(async (tx) => {
    const entry = await tx.fuelEntry.findUniqueOrThrow({ where: { id } });
    await tx.fuelEntry.delete({ where: { id } });
    if (entry.payableId) {
      await tx.payable.deleteMany({ where: { id: entry.payableId } });
    }
  });
  revalidatePath("/combustiveis");
  revalidatePath("/financeiro/a-pagar");
}

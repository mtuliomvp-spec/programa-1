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
    // Combustível de um veículo EM ESTOQUE é custo daquele veículo → centro
    // Veículos. Se o veículo já foi vendido (despesa pós-venda) ou não há
    // veículo (frota geral/placa avulsa) → Administrativo.
    let vehiclePlate: string | null = null;
    let vehicleSold = false;
    if (data.vehicleId) {
      const vehicle = await prisma.vehicle.findUniqueOrThrow({
        where: { id: data.vehicleId },
        select: { plate: true, status: true },
      });
      vehiclePlate = vehicle.plate;
      vehicleSold = vehicle.status === "VENDIDO";
    }
    const centerId = await structuralCenterId(
      data.vehicleId && !vehicleSold ? "VEICULOS" : "ADMINISTRATIVO",
    );
    await prisma.$transaction(async (tx) => {
      const plate = data.vehicleId ? vehiclePlate : data.plate?.trim().toUpperCase() || null;

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

      // Combustível de um veículo é custo daquele carro: registra também como
      // VehicleCost (igual aos demais lançamentos com veículo). Sem isso o valor
      // ficava invisível ao Lucro/Prejuízo (divergindo da equação patrimonial).
      // Em estoque entra no custo da venda; vendido vira custo pós-venda.
      if (data.vehicleId) {
        await tx.vehicleCost.create({
          data: {
            vehicleId: data.vehicleId,
            description: `Combustível${data.station ? ` - ${data.station}` : ""}`,
            category: "OUTROS",
            amount: total,
            date,
            postSale: vehicleSold,
            notes: data.notes || null,
            payableId: payable.id,
          },
        });
      }
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
      // O custo de veículo referencia a conta a pagar (SetNull no delete);
      // apaga primeiro para não deixar custo órfão contando na margem.
      await tx.vehicleCost.deleteMany({ where: { payableId: entry.payableId } });
      await tx.payable.deleteMany({ where: { id: entry.payableId } });
    }
  });
  revalidatePath("/combustiveis");
  revalidatePath("/financeiro/a-pagar");
}

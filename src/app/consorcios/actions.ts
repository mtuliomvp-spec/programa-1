"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ensureConsortiumInstallments } from "@/lib/recurring";
import { parseDateInput } from "@/lib/format";

export type ConsorcioFormState = { error?: string };

const schema = z.object({
  name: z.string().min(1, "Informe o nome do consórcio"),
  administrator: z.string().optional(),
  creditValue: z.coerce.number().positive("Informe o valor da carta de crédito"),
  installmentValue: z.coerce.number().positive("Informe o valor da parcela"),
  installmentsCount: z.coerce.number().int().min(1).max(240),
  dueDay: z.coerce.number().int().min(1).max(31),
  startDate: z.string().min(1),
  notes: z.string().optional(),
});

export async function createConsortiumAction(
  _prev: ConsorcioFormState,
  formData: FormData,
): Promise<ConsorcioFormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };

  await prisma.consortium.create({
    data: {
      name: parsed.data.name,
      administrator: parsed.data.administrator || null,
      creditValue: parsed.data.creditValue,
      installmentValue: parsed.data.installmentValue,
      installmentsCount: parsed.data.installmentsCount,
      dueDay: parsed.data.dueDay,
      startDate: parseDateInput(parsed.data.startDate),
      notes: parsed.data.notes || null,
    },
  });
  await ensureConsortiumInstallments();
  revalidatePath("/consorcios");
  revalidatePath("/financeiro/a-pagar");
  return {};
}

export async function setConsortiumStatusAction(
  id: string,
  status: "ATIVO" | "CONTEMPLADO" | "ENCERRADO",
) {
  await prisma.consortium.update({
    where: { id },
    data: { status, contemplatedAt: status === "CONTEMPLADO" ? new Date() : undefined },
  });
  if (status === "ENCERRADO") {
    // parcelas futuras ainda não pagas deixam de fazer sentido
    await prisma.payable.deleteMany({ where: { consortiumId: id, status: "PENDENTE" } });
  }
  revalidatePath("/consorcios");
  revalidatePath("/financeiro/a-pagar");
}

export async function deleteConsortiumAction(id: string) {
  await prisma.$transaction(async (tx) => {
    await tx.payable.deleteMany({ where: { consortiumId: id, status: "PENDENTE" } });
    await tx.consortium.delete({ where: { id } });
  });
  revalidatePath("/consorcios");
  revalidatePath("/financeiro/a-pagar");
}

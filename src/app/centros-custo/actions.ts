"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";

export type CentroCustoFormState = { error?: string };

const schema = z.object({
  name: z.string().min(1, "Informe o nome"),
  type: z.enum(["OBRA", "IMOVEL", "OUTRO"]),
  notes: z.string().optional(),
});

export async function createCostCenterAction(
  _prev: CentroCustoFormState,
  formData: FormData,
): Promise<CentroCustoFormState> {
  try {
    await assertCan("administrativo", "centros");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  await prisma.costCenter.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      notes: parsed.data.notes || null,
    },
  });
  revalidatePath("/centros-custo");
  return {};
}

export async function toggleCostCenterAction(id: string, active: boolean) {
  await assertCan("administrativo", "centros");
  await prisma.costCenter.update({ where: { id }, data: { active } });
  revalidatePath("/centros-custo");
}

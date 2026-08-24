"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";

export type RateFormState = { error?: string; success?: string };

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || !isAdminRole(user.role)) throw new Error("Acesso negado");
  return user;
}

const schema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Informe o nome da financeira"),
  monthlyRate: z.string().optional(),
  maxInstallments: z.coerce.number().int().min(1).max(120).default(48),
  minDownPercent: z.coerce.number().min(0).max(90).default(20),
  bcbInstitution: z.string().optional(),
  active: z.string().optional(),
});

/** Vírgula decimal do teclado brasileiro: "1,79" vira 1.79. */
function taxa(valor: string | undefined): number | null {
  const limpo = (valor || "").replace(",", ".").trim();
  if (!limpo) return null;
  const n = Number(limpo);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export async function saveFinancingRateAction(
  _prev: RateFormState,
  formData: FormData,
): Promise<RateFormState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Apenas administradores podem alterar as financeiras." };
  }
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  const informada = (d.monthlyRate || "").trim();
  const taxaMensal = taxa(d.monthlyRate);
  if (informada && taxaMensal === null) {
    return { error: "Taxa inválida. Use, por exemplo, 1,79 para 1,79% ao mês." };
  }
  if (taxaMensal !== null && taxaMensal > 20) {
    return { error: "Taxa acima de 20% ao mês — confira se digitou a taxa MENSAL." };
  }

  const dados = {
    name: d.name.trim(),
    monthlyRate: taxaMensal,
    maxInstallments: d.maxInstallments,
    minDownPercent: d.minDownPercent,
    bcbInstitution: d.bcbInstitution?.trim() || null,
    active: d.active === "true",
  };

  const repetido = await prisma.financingRate.findFirst({
    where: { name: dados.name, ...(d.id ? { id: { not: d.id } } : {}) },
    select: { id: true },
  });
  if (repetido) return { error: "Já existe uma financeira com esse nome." };

  if (d.id) {
    await prisma.financingRate.update({ where: { id: d.id }, data: dados });
  } else {
    await prisma.financingRate.create({ data: dados });
  }

  revalidatePath("/parametros/financiamento");
  revalidatePath("/vitrine");
  return { success: d.id ? "Financeira atualizada." : "Financeira cadastrada." };
}

export async function deleteFinancingRateAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "Acesso negado." };
  }
  await prisma.financingRate.delete({ where: { id } });
  revalidatePath("/parametros/financiamento");
  revalidatePath("/vitrine");
  return { ok: true };
}

/** Liga/desliga o simulador na vitrine pública. */
export async function toggleSimulatorAction(on: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "Acesso negado." };
  }
  await prisma.companySettings.upsert({
    where: { id: "company" },
    update: { showroomSimulator: on },
    create: { id: "company", showroomSimulator: on },
  });
  revalidatePath("/parametros/financiamento");
  revalidatePath("/vitrine");
  return { ok: true };
}

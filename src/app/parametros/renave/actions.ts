"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { parseDateInput } from "@/lib/format";
import { DETRAN_STATUS_VALUES } from "@/lib/renave";

const schema = z.object({
  renaveAderido: z.string().optional(),
  renaveAderidoEm: z.string().optional(),
  renaveIntegradora: z.string().optional(),
  renaveIntegradoraStatus: z.string().optional(),
  renaveCnae: z.string().optional(),
  renaveObservacoes: z.string().optional(),
  detranRenaveStatus: z.string().optional(),
  detranRenaveCheckedAt: z.string().optional(),
  detranProtocolo: z.string().optional(),
  eCnpjValidUntil: z.string().optional(),
  renaveImplantacao: z.string().optional(),
  renaveObrigatorioEm: z.string().optional(),
});

export type RenaveConfigState = { error?: string; success?: string };

/**
 * Dados da adesão da loja ao Renave e a data usada nos avisos de implantação.
 *
 * O modo de implantação existe para a loja se organizar sem parar de vender:
 * enquanto ligado, o sistema aponta o que a resolução vai exigir e não bloqueia
 * nada. Desligá-lo é uma decisão da loja — hoje só muda o texto dos avisos.
 */
export async function saveRenaveConfigAction(
  _prev: RenaveConfigState,
  formData: FormData,
): Promise<RenaveConfigState> {
  const user = await getSessionUser();
  if (!user || !isAdminRole(user.role)) {
    return { error: "Apenas administradores podem alterar os parâmetros." };
  }
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;
  const data = (v?: string) => (v && v.trim() ? parseDateInput(v.trim()) : null);

  await prisma.companySettings.upsert({
    where: { id: "company" },
    update: {
      renaveAderido: d.renaveAderido === "true",
      renaveAderidoEm: data(d.renaveAderidoEm),
      renaveIntegradora: d.renaveIntegradora?.trim() || null,
      renaveIntegradoraStatus:
        d.renaveIntegradoraStatus === "CONTRATADA" || d.renaveIntegradoraStatus === "AVALIACAO"
          ? d.renaveIntegradoraStatus
          : null,
      renaveCnae: d.renaveCnae?.trim() || null,
      renaveObservacoes: d.renaveObservacoes?.trim().slice(0, 4000) || null,
      detranRenaveStatus: DETRAN_STATUS_VALUES.includes(d.detranRenaveStatus as never)
        ? (d.detranRenaveStatus as string)
        : null,
      detranRenaveCheckedAt: data(d.detranRenaveCheckedAt),
      detranProtocolo: d.detranProtocolo?.trim() || null,
      eCnpjValidUntil: data(d.eCnpjValidUntil),
      renaveImplantacao: d.renaveImplantacao === "true",
      renaveObrigatorioEm: data(d.renaveObrigatorioEm),
    },
    create: {
      id: "company",
      renaveAderido: d.renaveAderido === "true",
      renaveAderidoEm: data(d.renaveAderidoEm),
      renaveIntegradora: d.renaveIntegradora?.trim() || null,
      renaveIntegradoraStatus:
        d.renaveIntegradoraStatus === "CONTRATADA" || d.renaveIntegradoraStatus === "AVALIACAO"
          ? d.renaveIntegradoraStatus
          : null,
      renaveCnae: d.renaveCnae?.trim() || null,
      renaveObservacoes: d.renaveObservacoes?.trim().slice(0, 4000) || null,
      detranRenaveStatus: DETRAN_STATUS_VALUES.includes(d.detranRenaveStatus as never)
        ? (d.detranRenaveStatus as string)
        : null,
      detranRenaveCheckedAt: data(d.detranRenaveCheckedAt),
      detranProtocolo: d.detranProtocolo?.trim() || null,
      eCnpjValidUntil: data(d.eCnpjValidUntil),
      renaveImplantacao: d.renaveImplantacao === "true",
      renaveObrigatorioEm: data(d.renaveObrigatorioEm),
    },
  });

  revalidatePath("/parametros/renave");
  revalidatePath("/estoque/renave");
  revalidatePath("/", "layout");
  return { success: "Configuração do Renave salva." };
}

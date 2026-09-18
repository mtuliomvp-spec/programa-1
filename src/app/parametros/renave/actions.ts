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
  renaveAdesaoSolicitadaEm: z.string().optional(),
  renaveAdesaoProtocolo: z.string().optional(),
  renaveAdesaoSei: z.string().optional(),
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
      renaveAdesaoSolicitadaEm: data(d.renaveAdesaoSolicitadaEm),
      renaveAdesaoProtocolo: d.renaveAdesaoProtocolo?.trim() || null,
      renaveAdesaoSei: d.renaveAdesaoSei?.trim() || null,
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
      renaveAdesaoSolicitadaEm: data(d.renaveAdesaoSolicitadaEm),
      renaveAdesaoProtocolo: d.renaveAdesaoProtocolo?.trim() || null,
      renaveAdesaoSei: d.renaveAdesaoSei?.trim() || null,
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

// ---------------------------------------------------------------------------
// Assistente de preenchimento
// ---------------------------------------------------------------------------

/** Campos que o assistente pode gravar, um passo de cada vez. */
const passoSchema = z.object({
  renaveAderido: z.enum(["true", "false"]).optional(),
  renaveAderidoEm: z.string().optional(),
  renaveAdesaoSolicitadaEm: z.string().optional(),
  renaveAdesaoProtocolo: z.string().optional(),
  renaveAdesaoSei: z.string().optional(),
  renaveIntegradora: z.string().optional(),
  renaveIntegradoraStatus: z.string().optional(),
  renaveCnae: z.string().optional(),
  eCnpjValidUntil: z.string().optional(),
  detranRenaveStatus: z.string().optional(),
  detranRenaveCheckedAt: z.string().optional(),
  detranProtocolo: z.string().optional(),
  renaveObrigatorioEm: z.string().optional(),
  renaveImplantacao: z.enum(["true", "false"]).optional(),
  renaveObservacoes: z.string().optional(),
});

export type PassoResult = { ok: boolean; error?: string; message?: string };

/**
 * Grava UM passo do assistente — só os campos enviados.
 *
 * O formulário completo de Parâmetros manda tudo de uma vez e, por isso, campo
 * ausente vira null. Aqui é o contrário: o assistente é preenchido aos poucos,
 * do que a loja tem em mãos naquele momento, e o que não veio no passo não pode
 * apagar o que já estava salvo.
 */
export async function salvarPassoRenaveAction(
  campos: Record<string, string>,
): Promise<PassoResult> {
  const user = await getSessionUser();
  if (!user || !isAdminRole(user.role)) {
    return { ok: false, error: "Apenas administradores podem alterar os parâmetros." };
  }
  const parsed = passoSchema.safeParse(campos);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;
  const data = (v: string) => (v.trim() ? parseDateInput(v.trim()) : null);
  const texto = (v: string, max = 200) => (v.trim() ? v.trim().slice(0, max) : null);

  const update: Record<string, unknown> = {};
  if (d.renaveAderido !== undefined) update.renaveAderido = d.renaveAderido === "true";
  if (d.renaveAderidoEm !== undefined) update.renaveAderidoEm = data(d.renaveAderidoEm);
  if (d.renaveAdesaoSolicitadaEm !== undefined) update.renaveAdesaoSolicitadaEm = data(d.renaveAdesaoSolicitadaEm);
  if (d.renaveAdesaoProtocolo !== undefined) update.renaveAdesaoProtocolo = texto(d.renaveAdesaoProtocolo);
  if (d.renaveAdesaoSei !== undefined) update.renaveAdesaoSei = texto(d.renaveAdesaoSei);
  if (d.renaveIntegradora !== undefined) update.renaveIntegradora = texto(d.renaveIntegradora);
  if (d.renaveIntegradoraStatus !== undefined) {
    update.renaveIntegradoraStatus =
      d.renaveIntegradoraStatus === "CONTRATADA" || d.renaveIntegradoraStatus === "AVALIACAO"
        ? d.renaveIntegradoraStatus
        : null;
  }
  if (d.renaveCnae !== undefined) update.renaveCnae = texto(d.renaveCnae, 40);
  if (d.eCnpjValidUntil !== undefined) update.eCnpjValidUntil = data(d.eCnpjValidUntil);
  if (d.detranRenaveStatus !== undefined) {
    update.detranRenaveStatus = DETRAN_STATUS_VALUES.includes(d.detranRenaveStatus as never)
      ? d.detranRenaveStatus
      : null;
  }
  if (d.detranRenaveCheckedAt !== undefined) update.detranRenaveCheckedAt = data(d.detranRenaveCheckedAt);
  if (d.detranProtocolo !== undefined) update.detranProtocolo = texto(d.detranProtocolo);
  if (d.renaveObrigatorioEm !== undefined) update.renaveObrigatorioEm = data(d.renaveObrigatorioEm);
  if (d.renaveImplantacao !== undefined) update.renaveImplantacao = d.renaveImplantacao === "true";
  if (d.renaveObservacoes !== undefined) {
    update.renaveObservacoes = d.renaveObservacoes.trim() ? d.renaveObservacoes.trim().slice(0, 4000) : null;
  }
  if (Object.keys(update).length === 0) return { ok: true, message: "Nada a salvar." };

  await prisma.companySettings.upsert({
    where: { id: "company" },
    update,
    create: { id: "company", ...update },
  });

  revalidatePath("/parametros/renave");
  revalidatePath("/parametros/renave/assistente");
  revalidatePath("/parametros/renave/passo-a-passo");
  revalidatePath("/estoque/renave");
  revalidatePath("/", "layout");
  return { ok: true, message: "Salvo." };
}

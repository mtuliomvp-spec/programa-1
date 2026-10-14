"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { nfeConfigSchema } from "@/lib/nfe-config";

export type NfeConfigState = { error?: string; success?: string };

/** Regra fiscal da emissão de NF-e (o que o contador definiu) e o provedor. */
export async function saveNfeConfigAction(_prev: NfeConfigState, formData: FormData): Promise<NfeConfigState> {
  const user = await getSessionUser();
  if (!user || !isAdminRole(user.role)) {
    return { error: "Apenas administradores podem alterar os parâmetros." };
  }
  const f = (k: string) => String(formData.get(k) ?? "").trim();
  const parsed = nfeConfigSchema.safeParse({
    provedor: f("provedor") || null,
    provedorNome: f("provedorNome").slice(0, 80),
    ambiente: f("ambiente") || "HOMOLOGACAO",
    credenciadaSefaz: f("credenciadaSefaz") === "true",
    certificadoA1: f("certificadoA1") === "true",
    regime: f("regime") || null,
    serie: f("serie").replace(/\D/g, "").slice(0, 3) || "1",
    naturezaEntrada: f("naturezaEntrada").slice(0, 60),
    cfopEntradaUf: f("cfopEntradaUf"),
    cfopEntradaForaUf: f("cfopEntradaForaUf"),
    naturezaSaida: f("naturezaSaida").slice(0, 60),
    cfopSaidaUf: f("cfopSaidaUf"),
    cfopSaidaForaUf: f("cfopSaidaForaUf"),
    ncmPadrao: f("ncmPadrao"),
    icmsCst: f("icmsCst").slice(0, 10),
    icmsReducaoBase: f("icmsReducaoBase").slice(0, 10),
    icmsAliquota: f("icmsAliquota").slice(0, 10),
    pisCofinsCst: f("pisCofinsCst").slice(0, 10),
    informacoesComplementares: f("informacoesComplementares").slice(0, 2000),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };

  await prisma.companySettings.upsert({
    where: { id: "company" },
    update: { nfeConfig: parsed.data },
    create: { id: "company", nfeConfig: parsed.data },
  });
  revalidatePath("/parametros/nfe");
  return { success: "Configuração da NF-e salva." };
}

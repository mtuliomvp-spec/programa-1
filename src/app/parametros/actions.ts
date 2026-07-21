"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { normalizePublicUrl } from "@/lib/base-url";

const schema = z.object({
  razaoSocial: z.string().min(1, "Informe a razão social"),
  nomeFantasia: z.string().min(1, "Informe o nome fantasia"),
  cnpj: z.string().optional(),
  inscricaoEstadual: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  uf: z.string().max(2).optional(),
  logoDataUrl: z.string().optional(),
  publicUrl: z.string().optional(),
  aiProvider: z.string().optional(),
  aiModel: z.string().optional(),
  aiApiKey: z.string().optional(),
  aiApiKeyClear: z.string().optional(),
});

export type CompanyFormState = { error?: string; success?: boolean };

export async function saveCompanyAction(
  _prev: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return { error: "Apenas administradores podem alterar os parâmetros." };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const d = parsed.data;

  if (d.logoDataUrl && d.logoDataUrl.length > 420_000) {
    return { error: "A logo é muito grande — use uma imagem de até 300KB." };
  }
  if (d.logoDataUrl && !d.logoDataUrl.startsWith("data:image/")) {
    return { error: "Arquivo de logo inválido — envie uma imagem (PNG ou JPG)." };
  }

  // Domínio do site: valida e normaliza (aceita só o domínio; adiciona https://).
  const publicUrl = normalizePublicUrl(d.publicUrl);
  if (d.publicUrl && d.publicUrl.trim() && !publicUrl) {
    return { error: "Domínio do site inválido. Ex.: mvpveiculos.com.br" };
  }

  const data = {
    razaoSocial: d.razaoSocial,
    nomeFantasia: d.nomeFantasia,
    cnpj: d.cnpj || null,
    inscricaoEstadual: d.inscricaoEstadual || null,
    phone: d.phone || null,
    email: d.email || null,
    address: d.address || null,
    city: d.city || null,
    uf: d.uf ? d.uf.toUpperCase() : null,
    publicUrl,
    // Parecer IA: provedor/modelo sempre atualizam; a chave só muda quando uma
    // nova é digitada (em branco = mantém) ou quando pedem para remover.
    aiProvider: d.aiProvider === "OPENAI" ? "OPENAI" : "ANTHROPIC",
    aiModel: d.aiModel?.trim() || null,
    ...(d.aiApiKeyClear === "true"
      ? { aiApiKey: null }
      : d.aiApiKey && d.aiApiKey.trim()
        ? { aiApiKey: d.aiApiKey.trim() }
        : {}),
    // string vazia = manter a logo atual; "remover" = apagar
    ...(d.logoDataUrl === "remover"
      ? { logoDataUrl: null }
      : d.logoDataUrl
        ? { logoDataUrl: d.logoDataUrl }
        : {}),
  };

  await prisma.companySettings.upsert({
    where: { id: "company" },
    update: data,
    create: { id: "company", ...data },
  });

  // A empresa também vive no módulo Capital, como beneficiária própria
  const { ensureCompanyBeneficiary } = await import("@/lib/company");
  await ensureCompanyBeneficiary();

  revalidatePath("/", "layout");
  return { success: true };
}

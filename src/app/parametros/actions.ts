"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { normalizePublicUrl } from "@/lib/base-url";
import { isAdminRole } from "@/lib/permissions";

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
  instagram: z.string().optional(),
  googleAdsId: z.string().optional(),
  googleAdsLeadLabel: z.string().optional(),
  googleAnalyticsId: z.string().optional(),
  googleSiteVerification: z.string().optional(),
  anoFundacao: z.string().optional(),
  googleMapsUrl: z.string().optional(),
  aiProvider: z.string().optional(),
  aiModel: z.string().optional(),
  aiApiKey: z.string().optional(),
  aiApiKeyClear: z.string().optional(),
  plateApiToken: z.string().optional(),
  plateApiTokenClear: z.string().optional(),
});

export type CompanyFormState = { error?: string; success?: boolean };

export async function saveCompanyAction(
  _prev: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  const user = await getSessionUser();
  if (!user || !isAdminRole(user.role)) {
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

  // Domínio público e chaves de API são do DONO DO SISTEMA: o administrador da
  // loja não altera (o domínio depende do apontamento do servidor, e as chaves
  // são contratadas e pagas pelo fornecedor). A regra vale no servidor — não
  // basta a tela esconder os campos.
  const podeChaves = user.role === "SUPER_ADMIN";

  // Domínio do site: valida e normaliza (aceita só o domínio; adiciona https://).
  const publicUrl = normalizePublicUrl(d.publicUrl);
  if (podeChaves && d.publicUrl && d.publicUrl.trim() && !publicUrl) {
    return { error: "Domínio do site inválido. Ex.: mvpveiculos.com.br" };
  }

  // Google: IDs públicos das tags. Validados pelo formato para um código
  // trocado (o do Analytics no lugar do Ads) não ir parar na tag errada.
  const googleAdsId = (d.googleAdsId || "").trim().toUpperCase();
  if (googleAdsId && !/^AW-\d{6,}$/.test(googleAdsId)) {
    return { error: 'ID do Google Ads inválido — é o "AW-" seguido de números (ex.: AW-123456789).' };
  }
  const googleAnalyticsId = (d.googleAnalyticsId || "").trim().toUpperCase();
  if (googleAnalyticsId && !/^G-[A-Z0-9]{4,}$/.test(googleAnalyticsId)) {
    return { error: 'ID do Google Analytics inválido — é o "G-" seguido de letras e números (ex.: G-AB12CD34EF).' };
  }
  const googleAdsLeadLabel = (d.googleAdsLeadLabel || "").trim();
  if (googleAdsLeadLabel && !/^[A-Za-z0-9_-]{4,}$/.test(googleAdsLeadLabel)) {
    return { error: "Rótulo da conversão inválido — copie só o código depois da barra em send_to (ex.: AbCdEfGhIjK)." };
  }
  // Search Console: aceita só o código ou a meta tag inteira colada.
  const verif = (d.googleSiteVerification || "").trim();
  const googleSiteVerification = (verif.match(/content=["']([^"']+)["']/)?.[1] ?? verif).trim();
  const ano = Number((d.anoFundacao || "").trim());
  const anoFundacao = Number.isInteger(ano) && ano >= 1900 && ano <= new Date().getFullYear() ? ano : null;
  // Link da loja no Google Maps (Perfil da Empresa › Compartilhar).
  const googleMapsUrl = (d.googleMapsUrl || "").trim();
  if (googleMapsUrl && !/^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|g\.co\/kgs)\//i.test(googleMapsUrl)) {
    return { error: "Link do Google Maps inválido — no Maps, abra a MVP Veículos, toque em Compartilhar e copie o link (https://maps.app.goo.gl/…)." };
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
    ...(podeChaves ? { publicUrl } : {}),
    instagram: d.instagram?.trim() || null,
    googleAdsId: googleAdsId || null,
    googleAdsLeadLabel: googleAdsLeadLabel || null,
    googleAnalyticsId: googleAnalyticsId || null,
    googleSiteVerification: googleSiteVerification || null,
    anoFundacao,
    googleMapsUrl: googleMapsUrl || null,
    // Parecer IA e consulta por placa: só o Super Admin mexe. Provedor/modelo
    // acompanham a chave (são a configuração do mesmo serviço). A chave só muda
    // quando uma nova é digitada (em branco = mantém) ou quando pedem remoção.
    ...(podeChaves
      ? {
          aiProvider: d.aiProvider === "OPENAI" ? "OPENAI" : "ANTHROPIC",
          aiModel: d.aiModel?.trim() || null,
          ...(d.aiApiKeyClear === "true"
            ? { aiApiKey: null }
            : d.aiApiKey && d.aiApiKey.trim()
              ? { aiApiKey: d.aiApiKey.trim() }
              : {}),
          ...(d.plateApiTokenClear === "true"
            ? { plateApiToken: null }
            : d.plateApiToken && d.plateApiToken.trim()
              ? { plateApiToken: d.plateApiToken.trim() }
              : {}),
        }
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

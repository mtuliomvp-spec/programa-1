import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Normaliza o domínio digitado: aceita "mvpveiculos.com.br" ou a URL completa,
 * garante o https:// e remove barras finais. Retorna null se vazio/inválido.
 */
export function normalizePublicUrl(value: string | null | undefined): string | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withProto);
    if (!u.hostname.includes(".")) return null;
    return `${u.protocol}//${u.host}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * Endereço base (origin) do sistema para montar links absolutos — como o QR
 * Code de verificação da Ordem de Pagamento.
 *
 * Prioridade:
 *  1. Variável de ambiente `NEXT_PUBLIC_APP_URL` (ou `APP_URL`).
 *  2. Domínio configurado nos Parâmetros da empresa (campo "Domínio do site").
 *     É o caminho recomendado — o próprio Marco define, sem mexer na Vercel.
 *  3. Sem nada disso: usa o endereço pelo qual a página está sendo acessada.
 */
export async function getBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.trim().replace(/\/+$/, "");

  // Domínio dos Parâmetros (falha silenciosa: se o banco não responder, cai
  // para o host da requisição — nunca quebra a página que monta o link).
  try {
    const company = await prisma.companySettings.findUnique({
      where: { id: "company" },
      select: { publicUrl: true },
    });
    const fromDb = normalizePublicUrl(company?.publicUrl);
    if (fromDb) return fromDb;
  } catch {
    // ignora e usa o host da requisição
  }

  const h = await headers();
  const host = h.get("host") || "";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

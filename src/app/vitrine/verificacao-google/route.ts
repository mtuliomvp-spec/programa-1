import { getCompany } from "@/lib/company";
import { arquivoDeVerificacaoGoogle } from "@/lib/google-verificacao";

export const dynamic = "force-dynamic";

/**
 * Arquivo de verificação do Search Console ("googleXXXX.html"). O porteiro
 * (src/proxy.ts) reescreve /googleXXXX.html para cá; só responde se for o
 * arquivo que ESTA loja cadastrou em Parâmetros — cada loja verifica o seu
 * próprio domínio, nunca o de outra.
 */
export async function GET(req: Request) {
  // Depois do rewrite, req.url pode trazer o endereço ORIGINAL
  // (/googleXXXX.html): aceita o nome pelo parâmetro ou pelo caminho.
  const url = new URL(req.url);
  const pedido = (url.searchParams.get("arquivo") || url.pathname.split("/").pop() || "").toLowerCase();
  const company = await getCompany().catch(() => null);
  const cadastrado = arquivoDeVerificacaoGoogle(company?.googleSiteVerification);
  if (!cadastrado || cadastrado !== pedido) return new Response("Não encontrado", { status: 404 });
  return new Response(`google-site-verification: ${cadastrado}`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

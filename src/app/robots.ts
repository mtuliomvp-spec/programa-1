import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/base-url";

export const dynamic = "force-dynamic";

/** Buscadores: indexam só a vitrine pública; o sistema interno fica fora. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await getBaseUrl();
  return {
    // "/$" libera só a página inicial do domínio (que leva à vitrine): sem
    // ela, o Google não podia ler a home e mostrava o site sem descrição
    // ("Nenhuma informação disponível para esta página").
    rules: [{ userAgent: "*", allow: ["/$", "/vitrine"], disallow: "/" }],
    sitemap: `${base}/sitemap.xml`,
  };
}

import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/base-url";

export const dynamic = "force-dynamic";

/** Buscadores: indexam só a vitrine pública; o sistema interno fica fora. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await getBaseUrl();
  return {
    rules: [{ userAgent: "*", allow: ["/vitrine", "/vitrine/"], disallow: "/" }],
    sitemap: `${base}/sitemap.xml`,
  };
}

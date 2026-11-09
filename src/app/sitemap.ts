import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/base-url";
import { getShowroomVehicles } from "./vitrine/shared";

export const dynamic = "force-dynamic";

/** Sitemap público: só a vitrine (o sistema interno fica fora dos buscadores). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await getBaseUrl();
  const vehicles = await getShowroomVehicles().catch(() => []);
  return [
    { url: `${base}/vitrine`, changeFrequency: "daily", priority: 1, lastModified: new Date() },
    ...vehicles.map((v) => ({
      url: `${base}/vitrine/${v.id}`,
      // Data da postagem: o Google prioriza o que mudou (carro novo no ar).
      ...(v.publishedAt ? { lastModified: v.publishedAt } : {}),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}

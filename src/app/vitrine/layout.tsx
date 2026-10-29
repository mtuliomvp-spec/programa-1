import type { Metadata } from "next";
import { getCompany } from "@/lib/company";
import { getSessionUser } from "@/lib/auth";
import { getBaseUrl } from "@/lib/base-url";
import GoogleTags from "./GoogleTags";
import { cidadeDaLoja } from "@/lib/loja-local";

/** Verificação do Search Console (meta tag) para o domínio da vitrine. */
export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompany().catch(() => null);
  return company?.googleSiteVerification ? { verification: { google: company.googleSiteVerification } } : {};
}

/**
 * Moldura de toda a vitrine pública: as tags do Google (Ads/GA4) e os dados
 * estruturados da LOJA (schema.org AutoDealer) — nome, endereço, telefone,
 * cidade e desde quando existe. É o que o Google usa para entender que esta
 * página é uma revenda de seminovos em São Luís, nas buscas e nos anúncios.
 *
 * Quem está logado no sistema (a equipe da loja) não carrega as tags: clique
 * de vendedor no WhatsApp não é lead e estragaria o aprendizado da campanha.
 */
export default async function VitrineLayout({ children }: { children: React.ReactNode }) {
  const [company, user, base] = await Promise.all([
    getCompany().catch(() => null),
    getSessionUser().catch(() => null),
    getBaseUrl().catch(() => ""),
  ]);
  const nome = company?.nomeFantasia || "MVP Veículos";
  const telefone = (company?.phone || "").replace(/\D/g, "");
  const loja = {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    name: nome,
    ...(company?.razaoSocial && company.razaoSocial !== nome ? { legalName: company.razaoSocial } : {}),
    url: `${base}/vitrine`,
    ...(telefone ? { telephone: `+55${telefone.replace(/^55/, "")}` } : {}),
    ...(company?.anoFundacao ? { foundingDate: String(company.anoFundacao) } : {}),
    ...(company?.city
      ? {
          address: {
            "@type": "PostalAddress",
            ...(company.address ? { streetAddress: company.address } : {}),
            addressLocality: cidadeDaLoja(company),
            ...(company.uf ? { addressRegion: company.uf } : {}),
            addressCountry: "BR",
          },
          areaServed: { "@type": "City", name: cidadeDaLoja(company) },
          ...(company.googleMapsUrl ? { hasMap: company.googleMapsUrl } : {}),
        }
      : {}),
    ...(company?.instagram
      ? {
          sameAs: [
            company.instagram.startsWith("http")
              ? company.instagram
              : `https://instagram.com/${company.instagram.replace(/^@/, "")}`,
          ],
        }
      : {}),
  };
  return (
    <>
      <script
        type="application/ld+json"
        // JSON montado no servidor a partir do cadastro; "<" escapado para não fechar a tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(loja).replace(/</g, "\\u003c") }}
      />
      {children}
      {!user ? (
        <GoogleTags
          adsId={company?.googleAdsId ?? null}
          leadLabel={company?.googleAdsLeadLabel ?? null}
          analyticsId={company?.googleAnalyticsId ?? null}
        />
      ) : null}
    </>
  );
}

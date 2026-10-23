-- Google na vitrine: tags do Google Ads/GA4, verificação do Search Console e
-- o ano de fundação da loja (dados estruturados).
ALTER TABLE "company_settings" ADD COLUMN "googleAdsId" TEXT,
ADD COLUMN "googleAdsLeadLabel" TEXT,
ADD COLUMN "googleAnalyticsId" TEXT,
ADD COLUMN "googleSiteVerification" TEXT,
ADD COLUMN "anoFundacao" INTEGER;

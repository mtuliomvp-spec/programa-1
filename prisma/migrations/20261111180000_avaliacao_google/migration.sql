-- Link público para o cliente avaliar a loja no Google (Perfil da Empresa).
ALTER TABLE "company_settings" ADD COLUMN "googleReviewUrl" TEXT;
-- Quando o pedido de avaliação foi enviado ao comprador (botão da venda).
ALTER TABLE "sales" ADD COLUMN "reviewRequestedAt" TIMESTAMP(3);

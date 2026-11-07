-- Pré-venda: quem gerou a ficha de negócio (usuário logado na criação).
ALTER TABLE "pre_sales" ADD COLUMN "createdById" TEXT;
ALTER TABLE "pre_sales" ADD COLUMN "createdByName" TEXT;

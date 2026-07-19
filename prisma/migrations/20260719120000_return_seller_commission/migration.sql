-- Comissão do vendedor sobre o retorno da financeira.
-- % do retorno líquido que vai para o vendedor (config na conta da financeira).
ALTER TABLE "financial_accounts" ADD COLUMN "sellerReturnPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
-- Escolha facultativa na pré-venda de pagar a comissão do retorno.
ALTER TABLE "pre_sales" ADD COLUMN "takeReturnCommission" BOOLEAN NOT NULL DEFAULT false;
-- Valor da comissão do retorno calculado no registro da venda.
ALTER TABLE "sales" ADD COLUMN "returnCommissionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

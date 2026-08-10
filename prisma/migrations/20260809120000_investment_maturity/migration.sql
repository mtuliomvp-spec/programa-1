-- Vencimento da aplicação: até quando o dinheiro rende naquela conta.
-- Sem isto não havia como saber que uma aplicação venceu, e o dinheiro podia
-- ficar parado sem render. Nulo = sem prazo (liquidez diária).
ALTER TABLE "financial_accounts" ADD COLUMN "investmentMaturity" TIMESTAMP(3);

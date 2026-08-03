-- Comissão do vendedor aplicada no capital dele (aporte) em vez de paga em
-- dinheiro. Flag escolhida na negociação; o aporte é gerado no fechamento da
-- venda quando o vendedor é beneficiário do capital.
ALTER TABLE "sales"
  ADD COLUMN "commissionToCapital" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "pre_sales"
  ADD COLUMN "commissionToCapital" BOOLEAN NOT NULL DEFAULT false;

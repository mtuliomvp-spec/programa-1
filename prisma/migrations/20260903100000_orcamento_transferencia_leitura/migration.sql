-- Orçamento do despachante lido por IA: para quem o veículo será transferido
-- (campo "Cliente" do recibo). Nulo = para o nome da própria loja.
ALTER TABLE "vehicles" ADD COLUMN "transferToName" TEXT;

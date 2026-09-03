-- Valor da transferência RESERVADO no registro da venda. O orçamento do
-- despachante pode ajustar sales.transferAmount para o valor real; este campo
-- guarda o que foi reservado, para a observação do título dizer "de X para Y"
-- mesmo em leituras repetidas.
ALTER TABLE "sales" ADD COLUMN "transferReservedAmount" DOUBLE PRECISION;

-- Vendas existentes: o reservado é o valor atual (ainda não ajustado).
UPDATE "sales" SET "transferReservedAmount" = "transferAmount"
WHERE "transferCharged" = true AND "transferReservedAmount" IS NULL;

-- Correção pontual: a única venda ajustada pela leitura ANTES de este campo
-- existir (Polo GHK7H21, MVP) tinha 850,00 reservados e já está em 880,00 —
-- o valor original foi sobrescrito e não existe em outro lugar. Idempotente e
-- inócuo em qualquer outra instalação (não há venda com essa placa e valor).
UPDATE "sales" s SET "transferReservedAmount" = 850
FROM "vehicles" v
WHERE v.id = s."vehicleId" AND v.plate = 'GHK7H21' AND s."transferAmount" = 880
  AND s."transferReservedAmount" = 880;

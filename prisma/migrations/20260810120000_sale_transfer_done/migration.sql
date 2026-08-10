-- Data em que a transferência de propriedade no DETRAN foi concluída.
-- Nulo = o veículo vendido ainda está no nome do dono anterior.
--
-- Não confundir com "transferCharged"/"transferAmount", que já existiam e
-- significam apenas que a transferência foi COBRADA do comprador na venda.

ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "transferDoneAt" TIMESTAMP(3);

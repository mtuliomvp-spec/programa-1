-- Linha digitável do boleto que o borderô paga: ela nasceu dentro da
-- observação (texto corrido), onde não dá para ter o botão de copiar que a
-- Ordem de Pagamento já tem. Passa a ter campo próprio, como no título.
ALTER TABLE "payment_combos" ADD COLUMN "barcode" TEXT;

-- Borderôs já unificados: tira a linha de dentro da observação e a põe no
-- campo (a observação segue com valor, vencimento e período dos serviços).
UPDATE "payment_combos"
SET "barcode" = substring("notes" from 'Linha digit[áa]vel: ([0-9][0-9. ]*[0-9])')
WHERE "barcode" IS NULL AND "notes" ~ 'Linha digit[áa]vel: [0-9]';

UPDATE "payment_combos"
SET "notes" = nullif(regexp_replace("notes", ' · Linha digit[áa]vel: [0-9][0-9. ]*[0-9]', ''), '')
WHERE "notes" ~ 'Linha digit[áa]vel: [0-9]';

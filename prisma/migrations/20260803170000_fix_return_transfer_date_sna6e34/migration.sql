-- Correção de DATA de um lançamento específico: a baixa do retorno da
-- financeira do Fiat Fastback Abarth 270 (SNA6E34) foi registrada em
-- 31/07/2026, mas aconteceu em 30/07/2026. Ajusta a(s) transferência(s) da
-- baixa e o "retorno recebido em" da venda. Não altera valores, contas nem
-- saldos — apenas a data. Idempotente (após rodar, o filtro não casa mais).

-- 1) Transferência(s) "Retorno financiamento ..." do SNA6E34 datadas de 31/07.
UPDATE "account_transfers"
SET "date" = '2026-07-30T12:00:00.000Z'
WHERE "description" LIKE 'Retorno financiamento%'
  AND "description" LIKE '%SNA6E34%'
  AND "date" >= '2026-07-31T00:00:00.000Z'
  AND "date" <  '2026-08-01T00:00:00.000Z';

-- 2) Perna de "Diferença de retorno" da mesma baixa, se existir (no-op senão).
UPDATE "account_transfers"
SET "date" = '2026-07-30T12:00:00.000Z'
WHERE "description" LIKE 'Diferença de retorno%'
  AND "description" LIKE '%SNA6E34%'
  AND "date" >= '2026-07-31T00:00:00.000Z'
  AND "date" <  '2026-08-01T00:00:00.000Z';

-- 3) Data "retorno recebido em" da venda do SNA6E34 (exibida na tela da venda).
UPDATE "sales"
SET "returnSettledAt" = '2026-07-30T12:00:00.000Z'
WHERE "returnSettledAt" >= '2026-07-31T00:00:00.000Z'
  AND "returnSettledAt" <  '2026-08-01T00:00:00.000Z'
  AND "vehicleId" IN (SELECT "id" FROM "vehicles" WHERE "plate" = 'SNA6E34');

-- Correção de DATA das baixas do financiamento do Renault Sandero Expr 10
-- (PSK4673): o repasse e o retorno da Financeira C6 foram registrados em
-- 06/08/2026 (data do clique), mas o dinheiro caiu em 03/08/2026 — a data de
-- trabalho do caixa aberto (extrato do banco confirma: Pix de R$ 31.847,20 e
-- R$ 1.130,45 em 03/08). Ajusta as transferências das baixas, eventuais pernas
-- de "Diferença de retorno" e as datas gravadas na venda. Não altera valores,
-- contas nem saldos — apenas a data. Idempotente (após rodar, o filtro de
-- range não casa mais). Precedente: 20260803170000_fix_return_transfer_date_sna6e34.

-- 1) Transferência "Repasse financiamento ..." do PSK4673 datada de 06/08.
UPDATE "account_transfers"
SET "date" = '2026-08-03T12:00:00.000Z'
WHERE "description" LIKE 'Repasse financiamento%'
  AND "description" LIKE '%PSK4673%'
  AND "date" >= '2026-08-06T00:00:00.000Z'
  AND "date" <  '2026-08-07T00:00:00.000Z';

-- 2) Transferência "Retorno financiamento ..." do PSK4673 datada de 06/08.
UPDATE "account_transfers"
SET "date" = '2026-08-03T12:00:00.000Z'
WHERE "description" LIKE 'Retorno financiamento%'
  AND "description" LIKE '%PSK4673%'
  AND "date" >= '2026-08-06T00:00:00.000Z'
  AND "date" <  '2026-08-07T00:00:00.000Z';

-- 3) Perna de "Diferença de retorno" da mesma baixa, se existir (no-op senão).
UPDATE "account_transfers"
SET "date" = '2026-08-03T12:00:00.000Z'
WHERE "description" LIKE 'Diferença de retorno%'
  AND "description" LIKE '%PSK4673%'
  AND "date" >= '2026-08-06T00:00:00.000Z'
  AND "date" <  '2026-08-07T00:00:00.000Z';

-- 4) Recebível de "Diferença de retorno (crédito)" da baixa, se existir.
UPDATE "receivables"
SET "dueDate" = '2026-08-03T12:00:00.000Z',
    "receivedDate" = '2026-08-03T12:00:00.000Z'
WHERE "description" LIKE 'Diferença de retorno%'
  AND "description" LIKE '%PSK4673%'
  AND "receivedDate" >= '2026-08-06T00:00:00.000Z'
  AND "receivedDate" <  '2026-08-07T00:00:00.000Z';

-- 5) Título de "Diferença de retorno (débito)" da baixa, se existir.
UPDATE "payables"
SET "dueDate" = '2026-08-03T12:00:00.000Z',
    "paymentDate" = '2026-08-03T12:00:00.000Z'
WHERE "description" LIKE 'Diferença de retorno%'
  AND "description" LIKE '%PSK4673%'
  AND "paymentDate" >= '2026-08-06T00:00:00.000Z'
  AND "paymentDate" <  '2026-08-07T00:00:00.000Z';

-- 6) Datas de baixa gravadas na venda do PSK4673 (exibidas na tela da venda).
UPDATE "sales"
SET "financerSettledAt" = '2026-08-03T12:00:00.000Z'
WHERE "financerSettledAt" >= '2026-08-06T00:00:00.000Z'
  AND "financerSettledAt" <  '2026-08-07T00:00:00.000Z'
  AND "vehicleId" IN (SELECT "id" FROM "vehicles" WHERE "plate" = 'PSK4673');

UPDATE "sales"
SET "returnSettledAt" = '2026-08-03T12:00:00.000Z'
WHERE "returnSettledAt" >= '2026-08-06T00:00:00.000Z'
  AND "returnSettledAt" <  '2026-08-07T00:00:00.000Z'
  AND "vehicleId" IN (SELECT "id" FROM "vehicles" WHERE "plate" = 'PSK4673');

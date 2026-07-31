-- Backfill de METADADOS do abatimento de comissão feito ANTES deste recurso
-- gravar a observação/descrição automaticamente. Não altera valores, status,
-- contas nem saldos — apenas textos exibidos. Idempotente (rodar de novo é no-op).

-- 1) Observação no título líquido da comissão (aparece na Ordem de pagamento),
--    explicando por que o valor a pagar ficou menor. Escopo: a comissão do
--    veículo SNA6E34 marcada como "(líquido ao vendedor)" e ainda sem observação.
UPDATE "payables"
SET "notes" = 'Comissão bruta R$ 781,33. Abatido R$ 191,90 no saldo de capital devedor de João Itapary. Líquido pago ao vendedor R$ 589,43.'
WHERE "category" = 'COMISSAO'
  AND "description" LIKE '%(líquido ao vendedor)'
  AND "description" LIKE '%SNA6E34%'
  AND "notes" IS NULL;

-- 2) Descrição da movimentação de capital (aporte de abatimento): passa a citar
--    a comissão de origem. Só existe UM registro com a descrição genérica antiga
--    (o do João) — abatimentos posteriores já nascem com a descrição detalhada.
UPDATE "capital_transactions"
SET "description" = 'Abatido do saldo devedor pela Comissão do retorno — João Itapary — Fiat Fastback Abarth 270 (SNA6E34)'
WHERE "description" = 'Abatimento do saldo devedor pela comissão';

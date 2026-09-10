-- Marca do LOTE do pré-lançamento: títulos pagos com o mesmo boleto (a fatura
-- mensal da comunicação de venda cobre um veículo por linha) compartilham a
-- marca, e a fila do caixa mostra uma linha só que abre nos títulos cobertos.
ALTER TABLE "payables" ADD COLUMN "pendingPaymentBatch" TEXT;

-- Lotes pré-lançados ANTES desta coluna guardavam a marca na observação
-- ("pago em lote com N título(s)"). Reagrupa pelo que eles têm em comum — a
-- data, a conta e a própria observação — e tira o prefixo, que agora quem diz
-- é a linha do lote.
UPDATE "payables"
SET "pendingPaymentBatch" = 'lote_' || md5(
      coalesce(to_char("pendingPaymentDate", 'YYYY-MM-DD'), '') || '|' ||
      coalesce("pendingPaymentAccountId", '') || '|' ||
      coalesce("pendingPaymentNote", ''))
WHERE "pendingPaymentDate" IS NOT NULL
  AND "pendingPaymentNote" LIKE 'pago em lote com %';

UPDATE "payables"
SET "pendingPaymentNote" = nullif(
      regexp_replace("pendingPaymentNote", '^pago em lote com [0-9]+ título\(s\)( · )?', ''), '')
WHERE "pendingPaymentNote" LIKE 'pago em lote com %';

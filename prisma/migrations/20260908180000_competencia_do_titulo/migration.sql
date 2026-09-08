-- Competência/referência do que o título cobra ("08/2026" na conta de luz,
-- "Setembro/2026" na mensalidade). Sai da leitura do boleto e aparece na Ordem
-- de Pagamento. É INFORMATIVA: a despesa continua entrando no resultado pelo
-- regime de caixa, na data do pagamento.
ALTER TABLE "payables" ADD COLUMN "referencePeriod" TEXT;

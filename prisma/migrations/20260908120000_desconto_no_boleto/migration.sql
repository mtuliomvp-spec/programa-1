-- Desconto por pontualidade do boleto ("desconto de R$ X até o vencimento"),
-- comum em condomínio e mensalidade. O valor do título continua sendo o cheio;
-- na baixa DENTRO DO PRAZO ele é reduzido para o valor com desconto.
-- O prazo real é `discountUntil` empurrado para o primeiro dia útil: vencimento
-- em sábado, domingo ou feriado é pagável com desconto no dia útil seguinte.
ALTER TABLE "payables" ADD COLUMN "discountAmount" DOUBLE PRECISION;
ALTER TABLE "payables" ADD COLUMN "discountUntil" TIMESTAMP(3);

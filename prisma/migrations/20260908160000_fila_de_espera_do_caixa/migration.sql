-- FILA DE ESPERA do caixa. O comprovante do banco chega antes de o movimento
-- de caixa alcançar o dia do pagamento (paga-se dia 08 com o caixa ainda no
-- dia 04). O título fica PRÉ-LANÇADO com o que o comprovante diz — data, valor
-- e conta debitada — e a baixa de verdade só acontece com um ok quando o caixa
-- daquele dia é aberto, sem furar a regra de lançar só na data do caixa.
ALTER TABLE "payables" ADD COLUMN "pendingPaymentDate" TIMESTAMP(3);
ALTER TABLE "payables" ADD COLUMN "pendingPaymentAmount" DOUBLE PRECISION;
ALTER TABLE "payables" ADD COLUMN "pendingPaymentAccountId" TEXT;
ALTER TABLE "payables" ADD COLUMN "pendingPaymentNote" TEXT;

CREATE INDEX "payables_pendingPaymentDate_idx" ON "payables"("pendingPaymentDate");

ALTER TABLE "payables" ADD CONSTRAINT "payables_pendingPaymentAccountId_fkey"
  FOREIGN KEY ("pendingPaymentAccountId") REFERENCES "financial_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

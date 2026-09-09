-- Comprovante do COMBO e pré-lançamento do borderô.
--
-- O combo é pago de uma vez só, então o comprovante é um só para todos os
-- títulos dele — prendê-lo a um título qualquer escondia isso. Com o
-- comprovante lido, o combo entra na mesma fila de espera do caixa dos títulos
-- avulsos: quando o movimento alcançar o dia do pagamento, ele aparece
-- pré-lançado esperando o ok para debitar.
ALTER TABLE "payment_combos" ADD COLUMN "pendingPaymentDate" TIMESTAMP(3);
ALTER TABLE "payment_combos" ADD COLUMN "pendingPaymentAmount" DOUBLE PRECISION;
ALTER TABLE "payment_combos" ADD COLUMN "pendingPaymentAccountId" TEXT;
ALTER TABLE "payment_combos" ADD COLUMN "pendingPaymentNote" TEXT;

ALTER TABLE "payment_combos"
  ADD CONSTRAINT "payment_combos_pendingPaymentAccountId_fkey"
  FOREIGN KEY ("pendingPaymentAccountId") REFERENCES "financial_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "combo_attachments" (
    "id" TEXT NOT NULL,
    "comboId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'COMPROVANTE',
    "description" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "combo_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "combo_attachments_comboId_idx" ON "combo_attachments"("comboId");

ALTER TABLE "combo_attachments"
  ADD CONSTRAINT "combo_attachments_comboId_fkey"
  FOREIGN KEY ("comboId") REFERENCES "payment_combos"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

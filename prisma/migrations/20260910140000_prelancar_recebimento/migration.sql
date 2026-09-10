-- Pré-lançamento do RECEBIMENTO: o outro lado do que já existia no pagamento.
--
-- O dinheiro cai na conta antes de o movimento do caixa alcançar o dia — e do
-- lado de quem recebe nem sempre existe comprovante: o cliente avisa por
-- telefone, ou o valor aparece no extrato. Agora o título guarda o que foi
-- informado (data, valor e conta creditada) e espera o ok, como já acontecia
-- com os pagamentos. O anexo (comprovante ou print do extrato) é opcional.
ALTER TABLE "receivables" ADD COLUMN "pendingReceiptDate" TIMESTAMP(3);
ALTER TABLE "receivables" ADD COLUMN "pendingReceiptAmount" DOUBLE PRECISION;
ALTER TABLE "receivables" ADD COLUMN "pendingReceiptAccountId" TEXT;
ALTER TABLE "receivables" ADD COLUMN "pendingReceiptNote" TEXT;

ALTER TABLE "receivables"
  ADD CONSTRAINT "receivables_pendingReceiptAccountId_fkey"
  FOREIGN KEY ("pendingReceiptAccountId") REFERENCES "financial_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "receivable_attachments" (
    "id" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'COMPROVANTE',
    "description" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receivable_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "receivable_attachments_receivableId_idx" ON "receivable_attachments"("receivableId");

ALTER TABLE "receivable_attachments"
  ADD CONSTRAINT "receivable_attachments_receivableId_fkey"
  FOREIGN KEY ("receivableId") REFERENCES "receivables"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

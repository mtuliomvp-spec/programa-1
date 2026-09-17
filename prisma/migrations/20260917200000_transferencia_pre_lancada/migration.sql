-- Transferência entre contas JÁ FEITA no banco, esperando o movimento alcançar
-- o dia (o "já paguei" dos títulos, para o dinheiro que anda entre as contas).
-- Tabela separada: enquanto espera, não mexe em saldo, extrato nem conciliação.
CREATE TABLE "pending_transfers" (
  "id" TEXT NOT NULL,
  "fromId" TEXT NOT NULL,
  "toId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "description" TEXT,
  "note" TEXT,
  "receiptName" TEXT,
  "receiptMime" TEXT,
  "receiptSize" INTEGER,
  "receiptData" BYTEA,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  CONSTRAINT "pending_transfers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pending_transfers_date_idx" ON "pending_transfers"("date");
ALTER TABLE "pending_transfers" ADD CONSTRAINT "pending_transfers_fromId_fkey"
  FOREIGN KEY ("fromId") REFERENCES "financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pending_transfers" ADD CONSTRAINT "pending_transfers_toId_fkey"
  FOREIGN KEY ("toId") REFERENCES "financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- O comprovante e a data real ficam com a transferência efetivada.
ALTER TABLE "account_transfers" ADD COLUMN "informedDate" TIMESTAMP(3);
ALTER TABLE "account_transfers" ADD COLUMN "note" TEXT;
ALTER TABLE "account_transfers" ADD COLUMN "receiptName" TEXT;
ALTER TABLE "account_transfers" ADD COLUMN "receiptMime" TEXT;
ALTER TABLE "account_transfers" ADD COLUMN "receiptSize" INTEGER;
ALTER TABLE "account_transfers" ADD COLUMN "receiptData" BYTEA;

-- Vencimento e número da NF/documento na solicitação de compra
ALTER TABLE "purchase_requests" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "purchase_requests" ADD COLUMN "documentNumber" TEXT;

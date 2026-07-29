-- Arquivo anexado a uma solicitação de compra (foto, PDF, orçamento…)
CREATE TABLE "purchase_request_attachments" (
    "id" TEXT NOT NULL,
    "purchaseRequestId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "purchase_request_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "purchase_request_attachments_purchaseRequestId_idx" ON "purchase_request_attachments"("purchaseRequestId");
ALTER TABLE "purchase_request_attachments" ADD CONSTRAINT "purchase_request_attachments_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Anexos dos títulos de contas a pagar (nota fiscal, comprovante…)
CREATE TABLE "payable_attachments" (
    "id" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payable_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payable_attachments_payableId_idx" ON "payable_attachments"("payableId");
ALTER TABLE "payable_attachments" ADD CONSTRAINT "payable_attachments_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Documentos anexados a uma recorrência (contrato de aluguel etc.).
CREATE TABLE "recurring_attachments" (
    "id" TEXT NOT NULL,
    "recurringId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recurring_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "recurring_attachments_recurringId_idx" ON "recurring_attachments"("recurringId");
ALTER TABLE "recurring_attachments" ADD CONSTRAINT "recurring_attachments_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "recurring_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

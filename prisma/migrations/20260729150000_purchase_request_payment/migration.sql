-- Espelho da solicitação de compra em Contas a pagar + config de pagamento
ALTER TABLE "payables" ADD COLUMN "purchaseRequestId" TEXT;
ALTER TABLE "payables" ADD CONSTRAINT "payables_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchase_requests" ADD COLUMN "category" "CategoriaPagar" NOT NULL DEFAULT 'OUTROS';
ALTER TABLE "purchase_requests" ADD COLUMN "installmentsCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "purchase_requests" ADD COLUMN "installmentPeriod" TEXT;
ALTER TABLE "purchase_requests" ADD COLUMN "installmentDays" INTEGER NOT NULL DEFAULT 30;

-- Pré-venda (rascunho da negociação, sem lançamentos financeiros).
CREATE TYPE "StatusPreVenda" AS ENUM ('ABERTA', 'CONVERTIDA', 'CANCELADA');

CREATE TABLE "pre_sales" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" "FormaPagamento" NOT NULL,
    "downPayment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "installmentsCount" INTEGER NOT NULL DEFAULT 0,
    "financerAccountId" TEXT,
    "financedAmount" DOUBLE PRECISION,
    "sellerName" TEXT,
    "notes" TEXT,
    "tradeIn" BOOLEAN NOT NULL DEFAULT false,
    "tiPlate" TEXT,
    "tiBrand" TEXT,
    "tiModel" TEXT,
    "tiManufactureYear" INTEGER,
    "tiModelYear" INTEGER,
    "tiColor" TEXT,
    "tiKm" INTEGER,
    "tiNegotiated" DOUBLE PRECISION,
    "tiPayoff" DOUBLE PRECISION,
    "tiPayoffTo" TEXT,
    "tiDebts" DOUBLE PRECISION,
    "status" "StatusPreVenda" NOT NULL DEFAULT 'ABERTA',
    "convertedSaleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pre_sales_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pre_sales_number_key" ON "pre_sales"("number");

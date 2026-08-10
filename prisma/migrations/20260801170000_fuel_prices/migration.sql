-- Preço por litro pré-determinado por combustível (Combustíveis).
CREATE TABLE "fuel_prices" (
    "id" TEXT NOT NULL,
    "fuelType" TEXT NOT NULL,
    "pricePerLiter" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fuel_prices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fuel_prices_fuelType_key" ON "fuel_prices"("fuelType");

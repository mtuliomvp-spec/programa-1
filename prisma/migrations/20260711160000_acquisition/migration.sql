-- Forma de aquisição do veículo (à vista, parcelado, financiado, consórcio).
CREATE TYPE "TipoAquisicao" AS ENUM ('A_VISTA', 'PARCELADO', 'FINANCIADO', 'CONSORCIO');
ALTER TABLE "vehicles" ADD COLUMN "acquisitionType" "TipoAquisicao" NOT NULL DEFAULT 'A_VISTA';
ALTER TABLE "vehicles" ADD COLUMN "downPayment" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "vehicles" ADD COLUMN "installmentsCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "vehicles" ADD COLUMN "financerName" TEXT;

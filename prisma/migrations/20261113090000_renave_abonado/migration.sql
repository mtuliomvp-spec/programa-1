-- Renave abonado: pendências de escrituração dispensadas em veículo vendido.
ALTER TABLE "vehicles" ADD COLUMN "renaveAbonadoEm" TIMESTAMP(3);
ALTER TABLE "vehicles" ADD COLUMN "renaveAbonadoPor" TEXT;

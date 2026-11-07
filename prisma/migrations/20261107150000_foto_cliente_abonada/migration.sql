-- Foto do cliente abonada (pendência dispensada): quando e quem.
ALTER TABLE "vehicles" ADD COLUMN "fotoClienteAbonadaEm" TIMESTAMP(3);
ALTER TABLE "vehicles" ADD COLUMN "fotoClienteAbonadaPor" TEXT;

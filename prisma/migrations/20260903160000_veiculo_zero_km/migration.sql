-- Veículo 0 km no financiamento de terceiros: sem placa e sem RENAVAM (só é
-- emplacado depois), identificado pelo chassi. `manufacturerName` guarda a
-- montadora/concessionária emitente da nota fiscal, que consta no contrato.
ALTER TABLE "vehicles"
  ADD COLUMN "zeroKm" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "manufacturerName" TEXT;

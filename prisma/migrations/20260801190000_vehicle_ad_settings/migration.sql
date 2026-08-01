-- Anúncio do veículo: destaque promocional + campos ocultos (vazio = mostra tudo).
ALTER TABLE "vehicles" ADD COLUMN "adPromo" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "adHiddenFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Comprovante do depósito de um sinal/entrada antecipada: id do anexo de veículo
-- (VehicleAttachment) servido por /anexos/[id]. String pura, sem FK.
ALTER TABLE "receivables" ADD COLUMN IF NOT EXISTS "proofAttachmentId" TEXT;

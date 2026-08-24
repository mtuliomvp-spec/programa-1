-- Acompanhamento da implantação do Renave: em que pé está a integradora
-- (avaliação x contratada) e as anotações da loja (o que a integradora
-- respondeu, o que o DETRAN do estado ainda não liberou).

ALTER TABLE "company_settings"
  ADD COLUMN "renaveIntegradoraStatus" TEXT,
  ADD COLUMN "renaveObservacoes" TEXT;

-- Quem já tinha uma integradora preenchida a tinha como contratada.
UPDATE "company_settings"
   SET "renaveIntegradoraStatus" = 'CONTRATADA'
 WHERE "renaveIntegradora" IS NOT NULL
   AND "renaveIntegradoraStatus" IS NULL;

-- Renave (Resolução Contran nº 1.026/2026): escrituração eletrônica de entrada
-- e saída de veículos. Aqui ficam os DADOS que o registro exige e o protocolo
-- do que já foi registrado — o registro em si é feito no Renave, por meio de
-- integradora autorizada.

CREATE TYPE "RenaveSituacao" AS ENUM (
  'SEM_REGISTRO',
  'ENTRADA_REGISTRADA',
  'ESTOQUE_VINCULADO',
  'CONSIGNADO_EM_TRANSFERENCIA',
  'SAIDA_REGISTRADA'
);

CREATE TYPE "TituloNegocio" AS ENUM (
  'COMPRA',
  'VENDA',
  'TRANSFERENCIA_ENTRE_ESTABELECIMENTOS',
  'CONSIGNACAO',
  'EXECUCAO_GARANTIA',
  'ENTRADA_VEICULO_PROPRIO',
  'ENTRADA_VEICULO_RETOMADO'
);

CREATE TYPE "TipoIdentificacaoPrevia" AS ENUM ('IDENTIFICACAO_PREVIA', 'VISTORIA');

CREATE TYPE "TipoAssinaturaVendedor" AS ENUM (
  'RECONHECIMENTO_FIRMA',
  'ELETRONICA_AVANCADA',
  'ELETRONICA_QUALIFICADA'
);

ALTER TABLE "vehicles"
  ADD COLUMN "renaveSituacao" "RenaveSituacao" NOT NULL DEFAULT 'SEM_REGISTRO',
  ADD COLUMN "renaveEntradaTitulo" "TituloNegocio",
  ADD COLUMN "renaveEntradaProtocolo" TEXT,
  ADD COLUMN "renaveEntradaEm" TIMESTAMP(3),
  ADD COLUMN "entryNfeNumber" TEXT,
  ADD COLUMN "entryNfeSerie" TEXT,
  ADD COLUMN "entryNfeKey" TEXT,
  ADD COLUMN "entryNfeIssuedAt" TIMESTAMP(3),
  ADD COLUMN "renavePreviaTipo" "TipoIdentificacaoPrevia",
  ADD COLUMN "renavePreviaNumero" TEXT,
  ADD COLUMN "renavePreviaEm" TIMESTAMP(3),
  ADD COLUMN "renaveAssinaturaTipo" "TipoAssinaturaVendedor",
  ADD COLUMN "renaveAssinaturaEm" TIMESTAMP(3),
  ADD COLUMN "crvNumber" TEXT,
  ADD COLUMN "crvSecurityCode" TEXT,
  ADD COLUMN "consignContractId" TEXT,
  ADD COLUMN "consignContractAt" TIMESTAMP(3),
  ADD COLUMN "renaveSaidaTitulo" "TituloNegocio",
  ADD COLUMN "renaveSaidaProtocolo" TEXT,
  ADD COLUMN "renaveSaidaEm" TIMESTAMP(3),
  ADD COLUMN "exitNfeNumber" TEXT,
  ADD COLUMN "exitNfeSerie" TEXT,
  ADD COLUMN "exitNfeKey" TEXT,
  ADD COLUMN "exitNfeIssuedAt" TIMESTAMP(3),
  ADD COLUMN "renaveVinculoMotivo" TEXT,
  ADD COLUMN "renaveNotes" TEXT;

ALTER TABLE "company_settings"
  ADD COLUMN "renaveImplantacao" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "renaveObrigatorioEm" TIMESTAMP(3),
  ADD COLUMN "renaveAderido" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "renaveAderidoEm" TIMESTAMP(3),
  ADD COLUMN "renaveIntegradora" TEXT,
  ADD COLUMN "renaveCnae" TEXT,
  ADD COLUMN "eCnpjValidUntil" TIMESTAMP(3);

-- Prazo do art. 33: 90 dias da publicação (30/06/2026) = 28/09/2026. Fica como
-- ponto de partida do aviso; a loja ajusta em Parâmetros → Renave.
UPDATE "company_settings"
   SET "renaveObrigatorioEm" = TIMESTAMP '2026-09-28 12:00:00'
 WHERE "renaveObrigatorioEm" IS NULL;

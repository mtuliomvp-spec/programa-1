-- Situação do DETRAN do estado no Renave de usados. O prazo da resolução vale
-- para a loja, mas a operação depende de o estado ter aderido — enquanto não
-- tiver, as etapas que dependem dele saem da cobrança do roteiro.

ALTER TABLE "company_settings"
  ADD COLUMN "detranRenaveStatus" TEXT,
  ADD COLUMN "detranRenaveCheckedAt" TIMESTAMP(3),
  ADD COLUMN "detranProtocolo" TEXT;

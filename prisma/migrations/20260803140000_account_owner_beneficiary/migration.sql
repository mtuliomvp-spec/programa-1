-- Titular verdadeiro da conta financeira: algumas contas cadastradas são de um
-- sócio (beneficiário do capital) e operam como se fossem da MVP. Informativo —
-- identifica o dono nas telas, sem alterar a contabilidade.
ALTER TABLE "financial_accounts"
  ADD COLUMN "ownerBeneficiaryId" TEXT;

ALTER TABLE "financial_accounts"
  ADD CONSTRAINT "financial_accounts_ownerBeneficiaryId_fkey"
  FOREIGN KEY ("ownerBeneficiaryId")
  REFERENCES "capital_beneficiaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

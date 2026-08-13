-- Venda paga com o CAPITAL de um sócio: sócio escolhido na negociação cujo
-- capital quita a venda no fechamento (recebível baixado no Banco Neutro +
-- retirada de capital paga no mesmo neutro). Independe do cliente do contrato.
ALTER TABLE "pre_sales" ADD COLUMN IF NOT EXISTS "capitalPayerBeneficiaryId" TEXT;

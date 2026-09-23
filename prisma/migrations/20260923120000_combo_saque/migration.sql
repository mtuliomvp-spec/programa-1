-- Combos de pagamento: tipo SAQUE.
--
-- O beneficiário do capital pede parte do seu capital livre pelo mesmo
-- caminho do combo — borderô, dados bancários, comprovante, fila do caixa e
-- estorno. O saque é um combo com um título só (a retirada de capital, que só
-- vira RETIRADA quando o combo é pago). Tudo o que já existe é PAGAMENTO.
ALTER TABLE "payment_combos" ADD COLUMN IF NOT EXISTS "tipo" TEXT NOT NULL DEFAULT 'PAGAMENTO';

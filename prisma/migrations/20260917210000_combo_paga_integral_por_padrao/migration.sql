-- Combo de pagamento: pagar o valor INTEGRAL passa a ser o padrão.
--
-- O abatimento do saldo devedor de capital acontecia sozinho sempre que o
-- beneficiário do combo estivesse devedor: parte do borderô virava aporte e um
-- recebível devolvia o dinheiro à conta. Quando o beneficiário recebe o total
-- (o caso normal), esse par mente duas vezes — infla o saldo da conta e apaga
-- uma dívida que continua de pé. Agora o abatimento é pedido combo a combo.
ALTER TABLE "payment_combos" ALTER COLUMN "payFull" SET DEFAULT true;

-- Combos ainda não pagos herdam o novo padrão: nenhum deles vai abater sem que
-- alguém peça. Combos PAGOS ou CANCELADOS ficam como estão (são histórico).
UPDATE "payment_combos" SET "payFull" = true WHERE "status" IN ('ABERTO', 'SOLICITADO');

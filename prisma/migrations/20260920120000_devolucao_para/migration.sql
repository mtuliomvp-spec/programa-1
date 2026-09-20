-- Financiamento de terceiros: a quem a loja devolve o excedente do financiamento.
--
-- A devolução era sempre do COMPRADOR. Só que a operação tem duas caras: ou o
-- comprador já pagou o vendedor e financiou para levantar o dinheiro (a
-- devolução é dele), ou o vendedor ainda não recebeu e será pago pela loja
-- quando o financiamento cair (a devolução é do vendedor). Sem este campo, o
-- título saía no nome errado e alguém tinha de corrigir à mão depois.
--
-- Vazio = COMPRADOR, que é como tudo o que já está lançado foi feito.
ALTER TABLE "pre_sales" ADD COLUMN IF NOT EXISTS "devolucaoPara" TEXT;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "devolucaoPara" TEXT;

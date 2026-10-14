-- Inscrição estadual de clientes e fornecedores (exigida na NF-e para empresa contribuinte).
ALTER TABLE "customers" ADD COLUMN "inscricaoEstadual" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "inscricaoEstadual" TEXT;

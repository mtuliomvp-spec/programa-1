-- Endereço em campos separados (exigência da NF-e) para clientes e fornecedores.
ALTER TABLE "customers" ADD COLUMN "endereco" JSONB;
ALTER TABLE "suppliers" ADD COLUMN "endereco" JSONB;

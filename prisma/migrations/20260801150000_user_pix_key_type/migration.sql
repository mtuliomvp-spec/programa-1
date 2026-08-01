-- Tipo da chave PIX do usuário (cpf | cnpj | telefone | email | aleatoria).
ALTER TABLE "users" ADD COLUMN "pixKeyType" TEXT;

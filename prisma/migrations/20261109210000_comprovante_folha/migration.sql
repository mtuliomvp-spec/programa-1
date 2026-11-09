-- Comprovante bancário de férias e rescisões pagas fora do sistema.
ALTER TABLE "employee_vacations" ADD COLUMN "comprovanteNome" TEXT, ADD COLUMN "comprovanteMime" TEXT, ADD COLUMN "comprovanteDados" BYTEA;
ALTER TABLE "employee_terminations" ADD COLUMN "comprovanteNome" TEXT, ADD COLUMN "comprovanteMime" TEXT, ADD COLUMN "comprovanteDados" BYTEA;

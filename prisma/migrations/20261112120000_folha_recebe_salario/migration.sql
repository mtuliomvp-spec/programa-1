-- Funcionário que recebe salário pela folha (desligado = só comissão).
ALTER TABLE "employees" ADD COLUMN "recebeSalario" BOOLEAN NOT NULL DEFAULT true;

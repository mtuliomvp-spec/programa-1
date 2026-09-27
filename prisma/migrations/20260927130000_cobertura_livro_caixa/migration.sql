-- Par no livro caixa da cobertura de saldo livre negativo.
ALTER TABLE "payables" ADD COLUMN "capitalCoverGroup" TEXT;
ALTER TABLE "receivables" ADD COLUMN "capitalCoverGroup" TEXT;

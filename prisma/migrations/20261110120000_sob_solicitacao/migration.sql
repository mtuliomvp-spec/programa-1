-- Títulos pagos só quando solicitados: recolhidos no Contas a pagar.
ALTER TABLE "payables" ADD COLUMN "sobSolicitacao" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "recurring_entries" ADD COLUMN "sobSolicitacao" BOOLEAN NOT NULL DEFAULT false;

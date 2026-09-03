-- Linha digitável do código de barras (boleto/fatura) no título: aparece na
-- Ordem de Pagamento com botão de copiar, para colar no leitor do banco.
ALTER TABLE "payables" ADD COLUMN "barcode" TEXT;

-- Baixa do financiamento: data em que a financeira pagou (repasse recebido).
ALTER TABLE "sales" ADD COLUMN "financerSettledAt" TIMESTAMP(3);

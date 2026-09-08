-- Competência/referência da recorrência e IDENTIDADE da ocorrência gerada.
--
-- Até aqui a geração reconhecia a parcela do mês pela DATA de vencimento dos
-- títulos já criados. Isso travava duas coisas do dia a dia das contas de
-- consumo: corrigir o vencimento de um título gerado (o boleto da luz chega
-- com outra data) fazia a geração recriar o dia original, e mudar o dia da
-- recorrência criava um segundo título do mesmo mês. Agora cada título nasce
-- com a chave da sua ocorrência ("2026-09" no mensal, "2026-09-15" no "a cada
-- N dias") e é ela que responde "esta parcela já existe".
ALTER TABLE "recurring_entries" ADD COLUMN "firstReference" TEXT;
ALTER TABLE "payables" ADD COLUMN "recurringPeriod" TEXT;
ALTER TABLE "receivables" ADD COLUMN "recurringPeriod" TEXT;
ALTER TABLE "receivables" ADD COLUMN "referencePeriod" TEXT;

-- Títulos já gerados: a ocorrência sai do vencimento que eles têm hoje (é o
-- que a geração usava). Sem isto, o primeiro título antigo cujo vencimento
-- fosse corrigido nasceria de novo.
UPDATE "payables" p
SET "recurringPeriod" = CASE
      WHEN r."intervalDays" IS NULL OR r."intervalDays" <= 0
        THEN to_char(p."dueDate", 'YYYY-MM')
      ELSE to_char(p."dueDate", 'YYYY-MM-DD')
    END
FROM "recurring_entries" r
WHERE p."recurringId" = r."id" AND p."recurringPeriod" IS NULL;

UPDATE "receivables" rc
SET "recurringPeriod" = CASE
      WHEN r."intervalDays" IS NULL OR r."intervalDays" <= 0
        THEN to_char(rc."dueDate", 'YYYY-MM')
      ELSE to_char(rc."dueDate", 'YYYY-MM-DD')
    END
FROM "recurring_entries" r
WHERE rc."recurringId" = r."id" AND rc."recurringPeriod" IS NULL;

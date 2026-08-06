-- Categoria "Documentação de veículo" (transferência DETRAN, licenciamento,
-- 2ª via de CRLV, vistoria, despachante) e correção do rótulo dos títulos de
-- transferência já lançados, que apareciam como "Comissão".
--
-- A categoria INTERNA do título (COMISSAO) NÃO é alterada de propósito: é ela
-- que diz à equação patrimonial que aquilo é custo da venda, já reconhecido no
-- resultado por competência. Aqui muda só o rótulo exibido. Sem efeito em
-- valores, status, contas, saldos ou farol. Idempotente.

-- 1) Categoria gerenciável (custom, editável/excluível como "Tráfego pago").
INSERT INTO "launch_categories" ("id", "name", "kind", "system", "code") VALUES
  (md5(random()::text || clock_timestamp()::text), 'Documentação de veículo', 'DESPESA', false, NULL)
ON CONFLICT ("name", "kind") DO NOTHING;

-- 2) Rótulo dos títulos de transferência gerados pelas vendas. Cobre os dois
--    casos existentes: rótulo nulo (títulos novos) e rótulo 'Comissão' (títulos
--    anteriores ao backfill de 20260731200000_categorias_gerenciaveis).
UPDATE "payables"
SET "categoryLabel" = 'Documentação de veículo'
WHERE "description" LIKE 'Transferência DETRAN%'
  AND "saleId" IS NOT NULL
  AND ("categoryLabel" IS NULL OR "categoryLabel" = 'Comissão');

-- Revisão das permissões granulares: tarefas que dependiam de uma permissão
-- larga ganharam a sua (km, situação e Renave no estoque; excluir, estornar,
-- livro caixa, recorrentes, categorias, comunicação de venda, caixa,
-- transferir e aplicações no financeiro; sócios e remuneração no capital).
-- Quem já fazia a tarefa pela permissão antiga recebe a nova — ninguém perde
-- acesso; o administrador ajusta depois. Sem repetir o que já existe.

UPDATE "users"
SET "permissions" = (SELECT array_agg(DISTINCT p) FROM unnest("permissions" || ARRAY['estoque.km','estoque.situacao','estoque.renave']) AS p)
WHERE 'estoque.editar' = ANY("permissions");

UPDATE "users"
SET "permissions" = (SELECT array_agg(DISTINCT p) FROM unnest("permissions" || ARRAY['financeiro.excluir','financeiro.livrocaixa','financeiro.recorrentes','financeiro.categorias','financeiro.comunicacaovenda']) AS p)
WHERE 'financeiro.criar' = ANY("permissions");

UPDATE "users"
SET "permissions" = (SELECT array_agg(DISTINCT p) FROM unnest("permissions" || ARRAY['financeiro.estornar']) AS p)
WHERE 'financeiro.pagar' = ANY("permissions");

UPDATE "users"
SET "permissions" = (SELECT array_agg(DISTINCT p) FROM unnest("permissions" || ARRAY['financeiro.estornar']) AS p)
WHERE 'financeiro.receber' = ANY("permissions");

UPDATE "users"
SET "permissions" = (SELECT array_agg(DISTINCT p) FROM unnest("permissions" || ARRAY['financeiro.caixa','financeiro.transferir','financeiro.aplicacoes']) AS p)
WHERE 'financeiro.contas' = ANY("permissions");

UPDATE "users"
SET "permissions" = (SELECT array_agg(DISTINCT p) FROM unnest("permissions" || ARRAY['administrativo.socios','administrativo.remuneracao']) AS p)
WHERE 'administrativo.capital' = ANY("permissions");

UPDATE "profiles"
SET "permissions" = (SELECT array_agg(DISTINCT p) FROM unnest("permissions" || ARRAY['estoque.km','estoque.situacao','estoque.renave']) AS p)
WHERE 'estoque.editar' = ANY("permissions");

UPDATE "profiles"
SET "permissions" = (SELECT array_agg(DISTINCT p) FROM unnest("permissions" || ARRAY['financeiro.excluir','financeiro.livrocaixa','financeiro.recorrentes','financeiro.categorias','financeiro.comunicacaovenda']) AS p)
WHERE 'financeiro.criar' = ANY("permissions");

UPDATE "profiles"
SET "permissions" = (SELECT array_agg(DISTINCT p) FROM unnest("permissions" || ARRAY['financeiro.estornar']) AS p)
WHERE 'financeiro.pagar' = ANY("permissions");

UPDATE "profiles"
SET "permissions" = (SELECT array_agg(DISTINCT p) FROM unnest("permissions" || ARRAY['financeiro.estornar']) AS p)
WHERE 'financeiro.receber' = ANY("permissions");

UPDATE "profiles"
SET "permissions" = (SELECT array_agg(DISTINCT p) FROM unnest("permissions" || ARRAY['financeiro.caixa','financeiro.transferir','financeiro.aplicacoes']) AS p)
WHERE 'financeiro.contas' = ANY("permissions");

UPDATE "profiles"
SET "permissions" = (SELECT array_agg(DISTINCT p) FROM unnest("permissions" || ARRAY['administrativo.socios','administrativo.remuneracao']) AS p)
WHERE 'administrativo.capital' = ANY("permissions");

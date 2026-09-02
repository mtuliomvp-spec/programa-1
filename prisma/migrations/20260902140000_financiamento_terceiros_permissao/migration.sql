-- Financiamento de terceiros ganha permissões próprias em Vendas:
--   vendas.terceiros          — criar/editar a pré-venda (ficha)
--   vendas.registrarterceiros — registrar (concluir a operação)
-- Antes, a ficha usava vendas.prevenda e a conclusão usava vendas.registrar (a
-- mesma da venda de estoque), então não dava para deixar o vendedor só
-- pré-finalizar. Quem tinha "prevenda" ganha "terceiros" para a ficha não sumir.
-- A conclusão NÃO é herdada de propósito: passa a ser liberada por usuário/perfil
-- na tela de permissões. Quem tem o formato antigo (só "vendas") já recebe tudo.
-- Idempotente.

UPDATE "users" SET permissions = array_append(permissions, 'vendas.terceiros')
WHERE 'vendas.prevenda' = ANY(permissions) AND NOT ('vendas.terceiros' = ANY(permissions));

UPDATE "profiles" SET permissions = array_append(permissions, 'vendas.terceiros')
WHERE 'vendas.prevenda' = ANY(permissions) AND NOT ('vendas.terceiros' = ANY(permissions));

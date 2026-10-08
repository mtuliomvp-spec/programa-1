-- Permissões granulares dos anexos do veículo: o que antes era só
-- "estoque.comunicacao" (todos os documentos) foi dividido em ATPV-e,
-- orçamento de transferência, boletos/guias e processo de transferência.
-- Quem já tinha a permissão antiga recebe as novas — ninguém perde acesso.
UPDATE "users"
SET "permissions" = "permissions" || ARRAY['estoque.atpv','estoque.orcamento','estoque.boletos','estoque.transferencia']
WHERE 'estoque.comunicacao' = ANY("permissions");

UPDATE "profiles"
SET "permissions" = "permissions" || ARRAY['estoque.atpv','estoque.orcamento','estoque.boletos','estoque.transferencia']
WHERE 'estoque.comunicacao' = ANY("permissions");

-- Nova permissão granular: estoque.sinal (Registrar sinal / entrada antecipada).
-- Antes, registrar/creditar/excluir sinal exigia estoque.editar — então quem
-- tinha "editar" ganha "sinal" para o acesso não sumir. Idempotente.
-- Quem tem o formato antigo (só "estoque") já recebe todas as ações do módulo.

UPDATE "users" SET permissions = array_append(permissions, 'estoque.sinal')
WHERE 'estoque.editar' = ANY(permissions) AND NOT ('estoque.sinal' = ANY(permissions));

UPDATE "profiles" SET permissions = array_append(permissions, 'estoque.sinal')
WHERE 'estoque.editar' = ANY(permissions) AND NOT ('estoque.sinal' = ANY(permissions));

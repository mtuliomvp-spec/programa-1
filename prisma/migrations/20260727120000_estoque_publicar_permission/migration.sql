-- Nova permissão granular "estoque.publicar" (Postar na vitrine).
-- Antes, postar/remover da vitrine reaproveitava "estoque.editar". Para que
-- ninguém perca o acesso já existente, concede "estoque.publicar" a todo
-- usuário e perfil que hoje já tem "estoque.editar".

UPDATE "users"
   SET "permissions" = array_append("permissions", 'estoque.publicar')
 WHERE 'estoque.editar' = ANY("permissions")
   AND NOT ('estoque.publicar' = ANY("permissions"));

UPDATE "profiles"
   SET "permissions" = array_append("permissions", 'estoque.publicar')
 WHERE 'estoque.editar' = ANY("permissions")
   AND NOT ('estoque.publicar' = ANY("permissions"));

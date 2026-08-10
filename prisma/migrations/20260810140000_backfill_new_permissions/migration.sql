-- Novas permissões granulares: quem já podia continuar podendo.
--
-- O catálogo de permissões é código, não banco — mas o que cada usuário/perfil
-- tem é uma lista de textos gravada aqui. Ao separar uma permissão nova de uma
-- que já existia, ninguém a receberia e o acesso sumiria sem aviso. Estes
-- UPDATEs preservam exatamente o comportamento de hoje:
--
--   estoque.lucro     -> ganha estoque.vercusto e estoque.pdfcusto
--                        (o custo na lista e o PDF com custo seguiam essa mesma
--                         permissão; agora cada um tem a sua)
--   cadastros.excluir -> ganha cadastros.unificar
--                        (as telas de unificar exigiam a permissão de excluir)
--
-- Quem tem o formato antigo (só "estoque" / "cadastros", sem a ação) já recebe
-- todas as ações do módulo — não precisa de nada aqui.
-- Idempotente: a segunda condição impede aplicar duas vezes.

UPDATE "users" SET permissions = array_append(permissions, 'estoque.vercusto')
WHERE 'estoque.lucro' = ANY(permissions) AND NOT ('estoque.vercusto' = ANY(permissions));

UPDATE "users" SET permissions = array_append(permissions, 'estoque.pdfcusto')
WHERE 'estoque.lucro' = ANY(permissions) AND NOT ('estoque.pdfcusto' = ANY(permissions));

UPDATE "users" SET permissions = array_append(permissions, 'cadastros.unificar')
WHERE 'cadastros.excluir' = ANY(permissions) AND NOT ('cadastros.unificar' = ANY(permissions));

UPDATE "profiles" SET permissions = array_append(permissions, 'estoque.vercusto')
WHERE 'estoque.lucro' = ANY(permissions) AND NOT ('estoque.vercusto' = ANY(permissions));

UPDATE "profiles" SET permissions = array_append(permissions, 'estoque.pdfcusto')
WHERE 'estoque.lucro' = ANY(permissions) AND NOT ('estoque.pdfcusto' = ANY(permissions));

UPDATE "profiles" SET permissions = array_append(permissions, 'cadastros.unificar')
WHERE 'cadastros.excluir' = ANY(permissions) AND NOT ('cadastros.unificar' = ANY(permissions));

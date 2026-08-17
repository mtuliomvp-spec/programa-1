-- Novo módulo "avaliacoes" (Veículos avaliados). Para não sumir acesso de quem
-- já opera o estoque, herda das permissões de estoque: quem vê estoque passa a
-- ver avaliações; quem cadastra/edita/exclui veículo ganha as ações
-- equivalentes; quem lança custos passa a poder conferir a entrega. Idempotente.

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['users', 'profiles'] LOOP
    -- visualizar: quem vê o estoque (ou tem o formato antigo "estoque")
    EXECUTE format($f$
      UPDATE %I SET permissions = array_append(permissions, 'avaliacoes.visualizar')
      WHERE ('estoque.visualizar' = ANY(permissions) OR 'estoque' = ANY(permissions))
        AND NOT ('avaliacoes.visualizar' = ANY(permissions))
    $f$, tbl);
    -- criar
    EXECUTE format($f$
      UPDATE %I SET permissions = array_append(permissions, 'avaliacoes.criar')
      WHERE 'estoque.criar' = ANY(permissions)
        AND NOT ('avaliacoes.criar' = ANY(permissions))
    $f$, tbl);
    -- editar
    EXECUTE format($f$
      UPDATE %I SET permissions = array_append(permissions, 'avaliacoes.editar')
      WHERE 'estoque.editar' = ANY(permissions)
        AND NOT ('avaliacoes.editar' = ANY(permissions))
    $f$, tbl);
    -- excluir
    EXECUTE format($f$
      UPDATE %I SET permissions = array_append(permissions, 'avaliacoes.excluir')
      WHERE 'estoque.excluir' = ANY(permissions)
        AND NOT ('avaliacoes.excluir' = ANY(permissions))
    $f$, tbl);
    -- conferir: quem lança custos (operação de recebimento/preparo do veículo)
    EXECUTE format($f$
      UPDATE %I SET permissions = array_append(permissions, 'avaliacoes.conferir')
      WHERE 'estoque.custos' = ANY(permissions)
        AND NOT ('avaliacoes.conferir' = ANY(permissions))
    $f$, tbl);
  END LOOP;
END $$;

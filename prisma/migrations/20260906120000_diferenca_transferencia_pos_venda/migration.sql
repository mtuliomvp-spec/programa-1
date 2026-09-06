-- Custo de veículo VENDIDO que muda depois da venda, quando o mês da venda já
-- está ENCERRADO: a diferença tem de entrar no PERÍODO ABERTO como custo
-- pós-venda, e não mexer no título reservado (mexer nele muda o resultado de um
-- mês fechado, cujo fechamento registrado não é refeito — e aí o Lucro/Prejuízo
-- do período aberto e o lucro acumulado do painel deixam de bater).
--
-- A leitura do orçamento do despachante passou a fazer isso sozinha. Esta
-- migração conserta o que foi ajustado pela regra antiga: devolve o título
-- reservado ao valor reservado na venda (e a competência junto) e lança a
-- diferença como custo pós-venda com título próprio, PENDENTE — pendente é
-- neutro nos dois lados (o Lucro/Prejuízo só reconhece pós-venda quando pago,
-- e a equação patrimonial deixa pós-venda pendente de fora), então as duas
-- telas voltam a mostrar o mesmo número na hora.
--
-- Só age no caso comprovadamente seguro: título da transferência ainda NÃO
-- PAGO, valor do título igual ao da venda e mês da venda fechado. Idempotente
-- (não repete onde o título da diferença já existe) e inócua onde não há nada
-- nessa situação.
DO $$
DECLARE
  r RECORD;
  centro TEXT;
  hoje TIMESTAMP;
  diferenca DOUBLE PRECISION;
  id_titulo TEXT;
  sufixo TEXT;
  descricao TEXT;
  observacao TEXT;
BEGIN
  SELECT id INTO centro FROM "cost_centers" WHERE key = 'ADMINISTRATIVO' LIMIT 1;
  hoje := date_trunc('day', now());

  FOR r IN
    SELECT
      s.id                       AS sale_id,
      s."vehicleId"              AS vehicle_id,
      s."transferAmount"         AS ajustado,
      s."transferReservedAmount" AS reservado,
      p.id                       AS payable_id,
      p."supplierId"             AS supplier_id,
      p."dueDate"                AS due_date,
      v.brand, v.model, v.plate,
      mc.month AS mes, mc.year AS ano
    FROM "sales" s
    JOIN "vehicles" v ON v.id = s."vehicleId"
    JOIN "payables" p
      ON p."saleId" = s.id
     AND p.description LIKE 'Transferência DETRAN%'
     AND p.status IN ('PENDENTE', 'ATRASADO')
     AND p.amount = s."transferAmount"
    JOIN "monthly_closings" mc
      ON mc.year = EXTRACT(YEAR FROM s."saleDate")::int
     AND mc.month = EXTRACT(MONTH FROM s."saleDate")::int
    WHERE s."transferReservedAmount" IS NOT NULL
      AND s."transferAmount" > s."transferReservedAmount"
  LOOP
    -- Já consertado numa execução anterior (ou pela própria tela)? Não repete.
    IF EXISTS (
      SELECT 1 FROM "vehicle_costs" c
      WHERE c."vehicleId" = r.vehicle_id
        AND c."postSale" = true
        AND c.description LIKE 'Diferença da transferência%'
    ) THEN
      CONTINUE;
    END IF;

    diferenca := round((r.ajustado - r.reservado)::numeric, 2);
    id_titulo := 'difftransf_' || r.sale_id;
    sufixo := r.brand || ' ' || r.model || ' (' || r.plate || ')';
    descricao :=
      'Diferença da transferência — orçamento ' ||
      ('R$ ' || replace(replace(replace(to_char(r.ajustado, 'FM999,999,990.00'), ',', '#'), '.', ','), '#', '.')) || ' × reservado na venda ' ||
      ('R$ ' || replace(replace(replace(to_char(r.reservado, 'FM999,999,990.00'), ',', '#'), '.', ','), '#', '.'));
    observacao :=
      'O mês da venda (' || lpad(r.mes::text, 2, '0') || '/' || r.ano ||
      ') já está encerrado, então o título reservado continua com o valor da venda e a diferença entra como custo pós-venda no período aberto.';

    INSERT INTO "payables" (
      id, description, category, amount, "dueDate", status,
      "supplierId", "vehicleId", notes, "costCenterId",
      "publicToken", "createdAt", "updatedAt"
    ) VALUES (
      id_titulo, descricao || ' - ' || sufixo, 'DESPESA_OPERACIONAL', diferenca,
      COALESCE(r.due_date, hoje), 'PENDENTE',
      r.supplier_id, r.vehicle_id, observacao, centro,
      'tok_' || id_titulo, now(), now()
    );

    INSERT INTO "vehicle_costs" (
      id, "vehicleId", description, category, amount, date, "postSale", notes, "payableId", "createdAt"
    ) VALUES (
      'costdifftransf_' || r.sale_id, r.vehicle_id, descricao, 'DOCUMENTACAO', diferenca,
      hoje, true, observacao, id_titulo, now()
    );

    -- Título reservado e competência voltam JUNTOS ao valor da venda: o mês
    -- encerrado fica exatamente como o fechamento registrou.
    UPDATE "payables" SET
      amount = r.reservado,
      notes = COALESCE(notes, '') ||
        ' Valor devolvido ao reservado na venda (' || ('R$ ' || replace(replace(replace(to_char(r.reservado, 'FM999,999,990.00'), ',', '#'), '.', ','), '#', '.')) ||
        '): a diferença de ' || ('R$ ' || replace(replace(replace(to_char(diferenca, 'FM999,999,990.00'), ',', '#'), '.', ','), '#', '.')) ||
        ' virou custo pós-venda em título próprio, porque o mês da venda já está encerrado.',
      "updatedAt" = now()
    WHERE id = r.payable_id;

    UPDATE "sales" SET "transferAmount" = r.reservado WHERE id = r.sale_id;
  END LOOP;
END $$;

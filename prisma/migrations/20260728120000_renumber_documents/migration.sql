-- Renumera os números de documento existentes para recomeçar do 1 (ordem de
-- compra/contrato, venda, ficha/pré-venda e ordem de pagamento). Depois de um
-- "zerar dados", as sequences SERIAL do Postgres não recuavam, então os números
-- continuavam altos (ex.: veículo novo saía como Nº 0024). Aqui renumeramos os
-- registros que já existem em 1..N (preservando a ordem atual) e alinhamos as
-- sequences. São números só de exibição (@unique, sem FK apontando para eles),
-- então renumerar é seguro para os vínculos.

-- Cada tabela em dois passos: primeiro desloca (+1000000) para não colidir com
-- o @unique, depois atribui 1..N na ordem atual.

-- vehicles.orderNumber
UPDATE "vehicles" SET "orderNumber" = "orderNumber" + 1000000;
WITH r AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "orderNumber") AS rn FROM "vehicles"
)
UPDATE "vehicles" t SET "orderNumber" = r.rn FROM r WHERE t."id" = r."id";

-- sales.orderNumber
UPDATE "sales" SET "orderNumber" = "orderNumber" + 1000000;
WITH r AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "orderNumber") AS rn FROM "sales"
)
UPDATE "sales" t SET "orderNumber" = r.rn FROM r WHERE t."id" = r."id";

-- payables.orderNumber
UPDATE "payables" SET "orderNumber" = "orderNumber" + 1000000;
WITH r AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "orderNumber") AS rn FROM "payables"
)
UPDATE "payables" t SET "orderNumber" = r.rn FROM r WHERE t."id" = r."id";

-- pre_sales.number
UPDATE "pre_sales" SET "number" = "number" + 1000000;
WITH r AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "number") AS rn FROM "pre_sales"
)
UPDATE "pre_sales" t SET "number" = r.rn FROM r WHERE t."id" = r."id";

-- Alinha todas as sequences ao maior número atual (próximo = MAX+1; se a tabela
-- estiver vazia, próximo = 1). purchase_requests.number (SERIAL oculto) também.
DO $$
DECLARE v bigint;
BEGIN
  SELECT COALESCE(MAX("orderNumber"),0) INTO v FROM "vehicles";
  PERFORM setval(pg_get_serial_sequence('vehicles','orderNumber'), GREATEST(v,1), v > 0);
  SELECT COALESCE(MAX("orderNumber"),0) INTO v FROM "sales";
  PERFORM setval(pg_get_serial_sequence('sales','orderNumber'), GREATEST(v,1), v > 0);
  SELECT COALESCE(MAX("orderNumber"),0) INTO v FROM "payables";
  PERFORM setval(pg_get_serial_sequence('payables','orderNumber'), GREATEST(v,1), v > 0);
  SELECT COALESCE(MAX("number"),0) INTO v FROM "pre_sales";
  PERFORM setval(pg_get_serial_sequence('pre_sales','number'), GREATEST(v,1), v > 0);
  SELECT COALESCE(MAX("number"),0) INTO v FROM "purchase_requests";
  PERFORM setval(pg_get_serial_sequence('purchase_requests','number'), GREATEST(v,1), v > 0);
END $$;

-- Os três botões de arquivo do Contas a pagar (importar comprovantes, importar
-- NFs do fornecedor e contrato de locação) ganharam permissão própria. Quem já
-- podia LANÇAR conta continua podendo usá-los — nada muda no dia seguinte ao
-- deploy; a partir de agora é que dá para tirar cada um separadamente.
UPDATE "profiles"
SET "permissions" = "permissions" || ARRAY[
  'financeiro.importarcomprovantes',
  'financeiro.importarnf',
  'financeiro.contratolocacao'
]
WHERE 'financeiro.criar' = ANY("permissions")
  AND NOT ('financeiro.importarcomprovantes' = ANY("permissions"));

UPDATE "users"
SET "permissions" = "permissions" || ARRAY[
  'financeiro.importarcomprovantes',
  'financeiro.importarnf',
  'financeiro.contratolocacao'
]
WHERE 'financeiro.criar' = ANY("permissions")
  AND NOT ('financeiro.importarcomprovantes' = ANY("permissions"));

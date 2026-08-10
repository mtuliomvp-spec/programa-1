-- Novo valor de categoria a pagar: devolução ao proprietário do veículo
-- consignado (valor devido ao dono, apurado no fechamento da venda ao
-- comprador). Isolado num migration próprio: em algumas versões/instâncias do
-- Postgres um valor de enum recém-adicionado não pode ser usado na mesma
-- transação em que foi criado.
ALTER TYPE "CategoriaPagar" ADD VALUE IF NOT EXISTS 'DEVOLUCAO_PROPRIETARIO';

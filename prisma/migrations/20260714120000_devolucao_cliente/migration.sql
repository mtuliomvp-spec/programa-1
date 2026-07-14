-- Novo valor de categoria a pagar: devolução ao cliente (quando o
-- financiamento/entrada excede o restante a pagar da venda).
ALTER TYPE "CategoriaPagar" ADD VALUE IF NOT EXISTS 'DEVOLUCAO_CLIENTE';

-- Token da consulta por placa/FIPE cadastrável nos Parâmetros da empresa.
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "plateApiToken" TEXT;

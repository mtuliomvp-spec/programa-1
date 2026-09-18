-- Renave: adesão PROTOCOLADA no Credencia e ainda em análise.
--
-- Até aqui a loja só podia dizer "aderiu" ou "não aderiu". Quem já protocolou
-- e espera a análise — que leva até 30 dias, prorrogáveis uma vez — aparecia
-- como quem não fez nada. A data e o número da solicitação deixam o roteiro
-- mostrar há quantos dias o pedido está em análise e cobrar a conferência de
-- pendência no Credencia (pendência aberta trava o prazo).
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "renaveAdesaoSolicitadaEm" TIMESTAMP(3);
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "renaveAdesaoProtocolo" TEXT;

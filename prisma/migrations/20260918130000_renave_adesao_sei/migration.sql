-- Renave: número do processo SEI aberto pela solicitação de adesão.
--
-- O Credencia mostra a solicitação; o andamento oficial corre no SEI do
-- Ministério dos Transportes (art. 10, § 4º). Guardar o número evita procurá-lo
-- no e-mail toda vez que alguém precisar acompanhar ou responder uma pendência.
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "renaveAdesaoSei" TEXT;

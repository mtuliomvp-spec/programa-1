-- Modo guia (explica cada botão antes e depois do clique) fora do demo:
-- ligado pelo administrador em Parâmetros, para treinar a equipe.
ALTER TABLE "company_settings" ADD COLUMN "modoGuia" BOOLEAN NOT NULL DEFAULT false;

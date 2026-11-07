-- Chat de ajuda: perguntas feitas ao assistente e as respostas.
CREATE TABLE "chat_ajuda_perguntas" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "pergunta" TEXT NOT NULL,
    "resposta" TEXT NOT NULL,
    "pagina" TEXT,
    "ferramentas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_ajuda_perguntas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "chat_ajuda_perguntas_createdAt_idx" ON "chat_ajuda_perguntas"("createdAt");
CREATE INDEX "chat_ajuda_perguntas_userId_idx" ON "chat_ajuda_perguntas"("userId");

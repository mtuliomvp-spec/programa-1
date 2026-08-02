-- Proteção contra força bruta no login: contador de tentativas por chave
-- (e-mail e IP) com bloqueio temporário após muitos erros seguidos.
CREATE TABLE "login_throttles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_throttles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "login_throttles_key_key" ON "login_throttles"("key");

-- Última atividade do usuário (batimento de /api/system-lock) e histórico de
-- acessos concluídos, para o painel do Super Admin.

ALTER TABLE "users" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

CREATE TABLE "login_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "device" TEXT,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "login_events_at_idx" ON "login_events"("at");
CREATE INDEX "login_events_userId_at_idx" ON "login_events"("userId", "at");

ALTER TABLE "login_events" ADD CONSTRAINT "login_events_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

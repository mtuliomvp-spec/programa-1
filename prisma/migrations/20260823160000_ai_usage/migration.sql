-- Contador de uso de IA por instalação.
CREATE TABLE IF NOT EXISTS "ai_usage" (
  "id"               TEXT NOT NULL,
  "feature"          TEXT NOT NULL,
  "provider"         TEXT NOT NULL DEFAULT 'ANTHROPIC',
  "model"            TEXT NOT NULL,
  "inputTokens"      INTEGER NOT NULL DEFAULT 0,
  "outputTokens"     INTEGER NOT NULL DEFAULT 0,
  "cacheReadTokens"  INTEGER NOT NULL DEFAULT 0,
  "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
  "costUsd"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ok"               BOOLEAN NOT NULL DEFAULT true,
  "errorMessage"     TEXT,
  "userId"           TEXT,
  "userName"         TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_usage_createdAt_idx" ON "ai_usage"("createdAt");
CREATE INDEX IF NOT EXISTS "ai_usage_feature_idx" ON "ai_usage"("feature");

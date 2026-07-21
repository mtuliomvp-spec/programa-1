-- Bloqueio do sistema (modo manutenção), com quem/quando bloqueou.
ALTER TABLE "company_settings" ADD COLUMN "systemLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "company_settings" ADD COLUMN "systemLockedBy" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "systemLockedAt" TIMESTAMP(3);

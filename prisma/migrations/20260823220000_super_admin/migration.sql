-- Perfil Super Admin (dono do sistema) e bloqueio por falta de pagamento.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'UserRole' AND e.enumlabel = 'SUPER_ADMIN'
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';
  END IF;
END $$;

ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "paymentBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "paymentBlockedAt" TIMESTAMP(3);
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "paymentBlockedMessage" TEXT;

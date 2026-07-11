-- AlterTable
ALTER TABLE "users" ADD COLUMN     "pending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resetRequestedAt" TIMESTAMP(3);

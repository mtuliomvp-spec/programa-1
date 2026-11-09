-- Funcionário ligado a um usuário do sistema (opcional, um para um).
ALTER TABLE "employees" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

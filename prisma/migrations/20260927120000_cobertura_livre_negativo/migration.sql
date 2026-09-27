-- Cobertura do saldo livre negativo de um sócio por outro (troca de dono da fatia aplicada).
ALTER TABLE "investment_allocations" ADD COLUMN "swapGroup" TEXT;
CREATE INDEX "investment_allocations_swapGroup_idx" ON "investment_allocations"("swapGroup");

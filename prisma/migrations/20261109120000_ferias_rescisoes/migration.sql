-- Férias e rescisões dos funcionários (Folha de pagamento).
CREATE TABLE "employee_vacations" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "aquisitivoInicio" TIMESTAMP(3) NOT NULL,
    "aquisitivoFim" TIMESTAMP(3) NOT NULL,
    "gozoInicio" TIMESTAMP(3) NOT NULL,
    "gozoFim" TIMESTAMP(3) NOT NULL,
    "dias" INTEGER NOT NULL DEFAULT 30,
    "abonoDias" INTEGER NOT NULL DEFAULT 0,
    "valorBruto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "descontos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorLiquido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pagamentoAte" TIMESTAMP(3) NOT NULL,
    "payableId" TEXT,
    "reciboNome" TEXT,
    "reciboMime" TEXT,
    "reciboDados" BYTEA,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_vacations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_terminations" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "avisoPrevio" TEXT NOT NULL DEFAULT 'NAO_SE_APLICA',
    "dataAviso" TIMESTAMP(3),
    "dataDesligamento" TIMESTAMP(3) NOT NULL,
    "pagamentoAte" TIMESTAMP(3) NOT NULL,
    "valorLiquido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "multaFgts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payableId" TEXT,
    "multaPayableId" TEXT,
    "arquivoNome" TEXT,
    "arquivoMime" TEXT,
    "arquivoDados" BYTEA,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_terminations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_vacations_payableId_key" ON "employee_vacations"("payableId");
CREATE INDEX "employee_vacations_employeeId_idx" ON "employee_vacations"("employeeId");
CREATE UNIQUE INDEX "employee_terminations_payableId_key" ON "employee_terminations"("payableId");
CREATE UNIQUE INDEX "employee_terminations_multaPayableId_key" ON "employee_terminations"("multaPayableId");
CREATE INDEX "employee_terminations_employeeId_idx" ON "employee_terminations"("employeeId");

ALTER TABLE "employee_vacations" ADD CONSTRAINT "employee_vacations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_terminations" ADD CONSTRAINT "employee_terminations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

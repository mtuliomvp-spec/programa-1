-- Valor realmente pago pela financeira no retorno (pode diferir do programado)
ALTER TABLE "sales" ADD COLUMN "returnPaidAmount" DOUBLE PRECISION;

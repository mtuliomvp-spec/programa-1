-- Venda através de tráfego pago (informativo, card do dashboard).
ALTER TABLE "pre_sales" ADD COLUMN "viaPaidTraffic" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "sales" ADD COLUMN "viaPaidTraffic" BOOLEAN NOT NULL DEFAULT false;

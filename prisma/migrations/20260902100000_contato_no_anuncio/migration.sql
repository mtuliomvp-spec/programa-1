-- Visita com contato: o visitante tocou em "Tenho interesse" (WhatsApp).
ALTER TABLE "showroom_visits" ADD COLUMN "contact" BOOLEAN NOT NULL DEFAULT false;

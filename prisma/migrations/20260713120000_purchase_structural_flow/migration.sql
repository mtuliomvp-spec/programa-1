-- Fluxo estrutural (obra estrutural) indicado na solicitação de compra.
ALTER TABLE "purchase_requests" ADD COLUMN "structuralKey" TEXT;

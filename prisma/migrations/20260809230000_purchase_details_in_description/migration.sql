-- Acrescenta a justificativa ("Detalhes / justificativa" da solicitação de
-- compra) à descrição dos títulos já gerados por solicitação, para que os
-- antigos fiquem iguais aos novos ("Compra 0011/2026: Sandero — Lavagem e
-- higienização").
--
-- Sem regex de escape: a justificativa é texto livre. O sufixo " - Parcela i/N"
-- é localizado por position() e a justificativa é inserida ANTES dele.
-- Idempotente: a última condição pula quem já tem a justificativa na descrição.
-- Quebras de linha da justificativa viram espaço, como faz generateEspelho.

WITH src AS (
  SELECT pr.id, regexp_replace(btrim(pr.details), '\s+', ' ', 'g') AS det
  FROM purchase_requests pr
  WHERE coalesce(btrim(pr.details), '') <> ''
)
UPDATE payables p
SET description = CASE
      WHEN position(' - Parcela ' in p.description) > 0
        THEN left(p.description, position(' - Parcela ' in p.description) - 1)
             || ' — ' || src.det
             || substring(p.description from position(' - Parcela ' in p.description))
      ELSE p.description || ' — ' || src.det
    END
FROM src
WHERE p."purchaseRequestId" = src.id
  AND position(src.det in p.description) = 0;

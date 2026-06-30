-- =============================================
-- MIGRACIÓN 008: EVIDENCIAS DEL SERVICIO
-- Additive / non-destructive. Compatible con datos existentes.
-- NO borra columnas, NO borra datos. Idempotente (IF NOT EXISTS).
-- =============================================
-- Reutiliza la tabla order_photos: una fila es "evidencia del servicio" cuando
-- evidence_type != NULL. `caption` guarda la nota opcional. La eliminación es
-- soft (deleted_at + deleted_by). Se puede ligar a una cotización adicional.

-- ---------------------------------------------
-- 1. Campos de evidencia en order_photos
-- ---------------------------------------------
ALTER TABLE order_photos
  ADD COLUMN IF NOT EXISTS evidence_type      TEXT,        -- pieza_danada | pieza_nueva | despues_trabajo
  ADD COLUMN IF NOT EXISTS deleted_at         TIMESTAMPTZ, -- soft delete (regla 6: auditado)
  ADD COLUMN IF NOT EXISTS deleted_by         UUID,
  ADD COLUMN IF NOT EXISTS delete_reason      TEXT,        -- motivo opcional de eliminación (regla 4)
  ADD COLUMN IF NOT EXISTS sent_to_client_at  TIMESTAMPTZ, -- cuándo se envió al cliente por WhatsApp
  ADD COLUMN IF NOT EXISTS sent_by            UUID,
  ADD COLUMN IF NOT EXISTS quotation_id       UUID;        -- cotización adicional creada desde esta evidencia

COMMENT ON COLUMN order_photos.evidence_type IS 'Tipo de evidencia: pieza_danada | pieza_nueva | despues_trabajo. NULL = foto de ingreso (no evidencia).';
COMMENT ON COLUMN order_photos.deleted_at IS 'Soft delete de evidencia (regla ELIHU 6). NULL = activa.';

-- FK opcional a la cotización adicional (SET NULL si se borra la cotización).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_photos_quotation_id_fkey'
  ) THEN
    ALTER TABLE order_photos
      ADD CONSTRAINT order_photos_quotation_id_fkey
      FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Índices para los listados del módulo (evidencias activas por orden).
CREATE INDEX IF NOT EXISTS idx_order_photos_evidence
  ON order_photos(order_id, evidence_type) WHERE evidence_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_photos_quotation ON order_photos(quotation_id);

-- ---------------------------------------------
-- 2. Cotización adicional ligada a una orden + autorización del cliente
-- ---------------------------------------------
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS order_id            UUID,                    -- orden origen del trabajo extra
  ADD COLUMN IF NOT EXISTS is_additional       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS client_authorized_at TIMESTAMPTZ;           -- regla 11: cliente autorizó el trabajo extra

COMMENT ON COLUMN quotations.is_additional IS 'TRUE = cotización de trabajo extra creada desde una evidencia de la orden.';
COMMENT ON COLUMN quotations.client_authorized_at IS 'Momento en que el cliente autorizó el trabajo extra desde el portal público.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_order_id_fkey'
  ) THEN
    ALTER TABLE quotations
      ADD CONSTRAINT quotations_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quotations_order ON quotations(order_id);

-- =============================================
-- FIN MIGRACIÓN 008
-- =============================================

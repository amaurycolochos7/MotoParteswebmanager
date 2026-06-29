-- =============================================
-- MIGRACIÓN 007: ELIHU WORKFLOW v1
-- Additive / non-destructive. Compatible con datos existentes.
-- NO borra columnas, NO borra datos, NO usa db push --accept-data-loss.
-- Idempotente: se puede correr varias veces sin efecto secundario.
-- =============================================

-- ---------------------------------------------
-- 1. Fecha prometida de entrega en órdenes (nullable, back-compat)
-- ---------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS estimated_delivery_at TIMESTAMPTZ;
COMMENT ON COLUMN orders.estimated_delivery_at IS 'ELIHU: fecha prometida/estimada de entrega';

-- ---------------------------------------------
-- 2. Retención de fotos (evidencia 30 días). category ya actúa como "tipo".
-- ---------------------------------------------
ALTER TABLE order_photos
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
COMMENT ON COLUMN order_photos.expires_at IS 'ELIHU: vencimiento de retención (created_at + 30d). El sweep solo borra filas con expires_at < now().';

-- Backfill: a las fotos existentes les damos 30 días desde su creación.
UPDATE order_photos
  SET expires_at = created_at + INTERVAL '30 days'
  WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_order_photos_expires_at ON order_photos(expires_at);

-- ---------------------------------------------
-- 3. Ciclo de vida de comisión (se libera SOLO al liquidar todo)
-- ---------------------------------------------
ALTER TABLE mechanic_earnings
  ADD COLUMN IF NOT EXISTS commission_status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT';
ALTER TABLE mechanic_earnings
  ADD COLUMN IF NOT EXISTS commission_released_at TIMESTAMPTZ;
COMMENT ON COLUMN mechanic_earnings.commission_status IS 'PENDING_PAYMENT | READY_TO_PAY | PAID | CANCELLED';

-- Backfill: comisiones ya pagadas pasan a PAID; el resto queda PENDING_PAYMENT.
UPDATE mechanic_earnings
  SET commission_status = 'PAID', commission_released_at = COALESCE(paid_at, created_at)
  WHERE is_paid = TRUE AND commission_status = 'PENDING_PAYMENT';

-- ---------------------------------------------
-- 4. Tabla de pagos / abonos por orden (append-only, cancelación con auditoría)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS order_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  receipt_number      TEXT UNIQUE,
  amount              NUMERIC(10,2) NOT NULL,
  payment_method      TEXT NOT NULL DEFAULT 'efectivo',
  payment_date        TIMESTAMPTZ NOT NULL DEFAULT now(),
  note                TEXT,
  received_by         UUID,
  created_by          UUID,
  cancelled_at        TIMESTAMPTZ,
  cancelled_by        UUID,
  cancellation_reason TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_payments_workspace ON order_payments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);

-- Folio legible de recibo (REC-YYYY-####) vía secuencia + trigger.
CREATE SEQUENCE IF NOT EXISTS order_payment_receipt_seq START 1;
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TRIGGER AS $$
DECLARE
  current_year TEXT := TO_CHAR(NOW(), 'YYYY');
  next_val TEXT;
BEGIN
  IF NEW.receipt_number IS NULL THEN
    SELECT LPAD(nextval('order_payment_receipt_seq')::TEXT, 4, '0') INTO next_val;
    NEW.receipt_number := 'REC-' || current_year || '-' || next_val;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_generate_receipt_number ON order_payments;
CREATE TRIGGER trg_generate_receipt_number
  BEFORE INSERT ON order_payments
  FOR EACH ROW EXECUTE FUNCTION generate_receipt_number();

-- Backfill: migrar advance_payment > 0 existente como un abono inicial,
-- para no perder lo ya cobrado. Solo si la orden aún no tiene pagos.
INSERT INTO order_payments (workspace_id, order_id, amount, payment_method, payment_date, note, created_at)
SELECT o.workspace_id, o.id, o.advance_payment,
       COALESCE(o.payment_method, 'efectivo'),
       COALESCE(o.paid_at, o.created_at),
       'Abono inicial migrado de advance_payment (migración 007)',
       COALESCE(o.paid_at, o.created_at)
FROM orders o
WHERE o.advance_payment > 0
  AND NOT EXISTS (SELECT 1 FROM order_payments p WHERE p.order_id = o.id);

-- ---------------------------------------------
-- 5. Estado "Autorizada" por workspace (no destructivo; no renombra existentes)
--    Se inserta solo donde no exista. display_order = 2 (después de la inicial).
-- ---------------------------------------------
INSERT INTO order_statuses (id, workspace_id, name, description, color, display_order, is_terminal, created_at)
SELECT gen_random_uuid(), w.id, 'Autorizada',
       'Cliente autorizó la cotización; orden lista para trabajarse', '#0ea5e9', 2, FALSE, now()
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM order_statuses s WHERE s.workspace_id = w.id AND s.name = 'Autorizada'
);

-- Estado global (workspace_id NULL) usado por talleres sin estados propios.
INSERT INTO order_statuses (id, workspace_id, name, description, color, display_order, is_terminal, created_at)
SELECT gen_random_uuid(), NULL, 'Autorizada',
       'Cliente autorizó la cotización; orden lista para trabajarse', '#0ea5e9', 2, FALSE, now()
WHERE NOT EXISTS (
  SELECT 1 FROM order_statuses s WHERE s.workspace_id IS NULL AND s.name = 'Autorizada'
);

-- ---------------------------------------------
-- 6. Índice de búsqueda de clientes por nombre (rendimiento)
--    pg_trgm permite ILIKE '%texto%' rápido. Si la extensión no está
--    disponible, el índice btree simple sigue ayudando en prefijos.
-- ---------------------------------------------
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS idx_clients_full_name_trgm
    ON clients USING gin (full_name gin_trgm_ops);
EXCEPTION WHEN insufficient_privilege OR feature_not_supported THEN
  -- Fallback sin superusuario: índice btree en lower(full_name).
  CREATE INDEX IF NOT EXISTS idx_clients_full_name_lower ON clients (lower(full_name));
END $$;

-- =============================================
-- FIN MIGRACIÓN 007
-- =============================================

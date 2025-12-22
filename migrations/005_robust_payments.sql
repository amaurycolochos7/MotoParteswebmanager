-- =============================================
-- MIGRACIÓN 005: Robustez en Pagos y Liquidaciones
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- 1. Crear secuencia para números de pago si no existe
CREATE SEQUENCE IF NOT EXISTS payment_number_seq START 1;

-- 2. Agregar Folio legible a payment_requests
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS payment_number TEXT UNIQUE;

-- 3. Función para generar el folio automáticamente (PAG-2025-0001)
CREATE OR REPLACE FUNCTION generate_payment_number()
RETURNS TRIGGER AS $$
DECLARE
    current_year TEXT := TO_CHAR(NOW(), 'YYYY');
    next_val TEXT;
BEGIN
    IF NEW.payment_number IS NULL THEN
        SELECT LPAD(nextval('payment_number_seq')::TEXT, 4, '0') INTO next_val;
        NEW.payment_number := 'PAG-' || current_year || '-' || next_val;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger para asignar el folio al insertar
DROP TRIGGER IF EXISTS trg_generate_payment_number ON payment_requests;
CREATE TRIGGER trg_generate_payment_number
BEFORE INSERT ON payment_requests
FOR EACH ROW
EXECUTE FUNCTION generate_payment_number();

-- 5. Agregar vínculo formal en mechanic_earnings
ALTER TABLE mechanic_earnings ADD COLUMN IF NOT EXISTS payment_request_id UUID REFERENCES payment_requests(id);

-- 6. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_payment_requests_number ON payment_requests(payment_number);
CREATE INDEX IF NOT EXISTS idx_mechanic_earnings_payment_id ON mechanic_earnings(payment_request_id);

-- 7. Comentario de guía
COMMENT ON COLUMN payment_requests.payment_number IS 'Folio legible del pago (ej. PAG-2025-0001)';
COMMENT ON COLUMN mechanic_earnings.payment_request_id IS 'Referencia formal al pago que liquidó esta comisión';

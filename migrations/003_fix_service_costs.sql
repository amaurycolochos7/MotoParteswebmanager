-- =============================================
-- MIGRACIÓN 003: Agregar desglose de costos a order_services
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- 1. Agregar columnas para separar mano de obra y materiales
ALTER TABLE order_services ADD COLUMN IF NOT EXISTS labor_cost DECIMAL(10,2) DEFAULT 0;
ALTER TABLE order_services ADD COLUMN IF NOT EXISTS materials_cost DECIMAL(10,2) DEFAULT 0;

-- 2. Actualizar el trigger para calcular correctamente los totales
CREATE OR REPLACE FUNCTION update_order_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Usar el order_id correcto dependiendo de si es INSERT/UPDATE o DELETE
  DECLARE
    target_order_id UUID;
  BEGIN
    IF TG_OP = 'DELETE' THEN
      target_order_id := OLD.order_id;
    ELSE
      target_order_id := NEW.order_id;
    END IF;
    
    UPDATE orders SET
      labor_total = (
        SELECT COALESCE(SUM(COALESCE(labor_cost, price) * quantity), 0) 
        FROM order_services 
        WHERE order_id = target_order_id
      ),
      parts_total = (
        SELECT COALESCE(SUM(COALESCE(materials_cost, 0) * quantity), 0) 
        FROM order_services 
        WHERE order_id = target_order_id
      ) + (
        SELECT COALESCE(SUM(price * quantity), 0) 
        FROM order_parts 
        WHERE order_id = target_order_id
      ),
      total_amount = (
        SELECT COALESCE(SUM(price * quantity), 0) 
        FROM order_services 
        WHERE order_id = target_order_id
      ) + (
        SELECT COALESCE(SUM(price * quantity), 0) 
        FROM order_parts 
        WHERE order_id = target_order_id
      ),
      updated_at = NOW()
    WHERE id = target_order_id;
    
    RETURN COALESCE(NEW, OLD);
  END;
END;
$$ LANGUAGE plpgsql;

-- 3. Recrear los triggers
DROP TRIGGER IF EXISTS update_order_totals_on_service ON order_services;
DROP TRIGGER IF EXISTS update_order_totals_on_parts ON order_parts;

CREATE TRIGGER update_order_totals_on_service
AFTER INSERT OR UPDATE OR DELETE ON order_services
FOR EACH ROW EXECUTE FUNCTION update_order_totals();

CREATE TRIGGER update_order_totals_on_parts
AFTER INSERT OR UPDATE OR DELETE ON order_parts
FOR EACH ROW EXECUTE FUNCTION update_order_totals();

-- =============================================
-- MIGRACIÓN: Sistema Mecánico Maestro / Auxiliar
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- 1. Agregar columnas a profiles para tipo de mecánico
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_master_mechanic BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_view_approved_orders BOOLEAN DEFAULT true;

-- 2. Crear tabla de solicitudes de órdenes
CREATE TABLE IF NOT EXISTS order_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Quién solicita (mecánico auxiliar)
  requested_by UUID REFERENCES profiles(id) NOT NULL,
  
  -- A quién se solicita (mecánico maestro)
  requested_to UUID REFERENCES profiles(id) NOT NULL,
  
  -- Estado de la solicitud
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  
  -- Datos de la orden (JSON con toda la info para crear la orden)
  order_data JSONB NOT NULL,
  
  -- Respuesta del maestro
  response_notes TEXT,
  responded_at TIMESTAMPTZ,
  
  -- Si fue aprobada, referencia a la orden creada
  created_order_id UUID REFERENCES orders(id),
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para solicitudes
CREATE INDEX IF NOT EXISTS idx_order_requests_requested_by ON order_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_order_requests_requested_to ON order_requests(requested_to);
CREATE INDEX IF NOT EXISTS idx_order_requests_status ON order_requests(status);

-- 3. Crear tabla de ganancias de mecánicos
CREATE TABLE IF NOT EXISTS mechanic_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Quién ganó (mecánico)
  mechanic_id UUID REFERENCES profiles(id) NOT NULL,
  
  -- Supervisor si aplica (mecánico maestro)
  supervisor_id UUID REFERENCES profiles(id),
  
  -- Orden asociada
  order_id UUID REFERENCES orders(id),
  
  -- Semana del registro
  week_start DATE NOT NULL,
  
  -- Montos
  labor_amount DECIMAL(10,2) NOT NULL,      -- Mano de obra total
  commission_rate DECIMAL(5,2) NOT NULL,    -- Porcentaje del mecánico
  earned_amount DECIMAL(10,2) NOT NULL,     -- Lo que gana el mecánico
  
  -- Estado de pago
  is_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para ganancias
CREATE INDEX IF NOT EXISTS idx_mechanic_earnings_mechanic ON mechanic_earnings(mechanic_id);
CREATE INDEX IF NOT EXISTS idx_mechanic_earnings_supervisor ON mechanic_earnings(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_mechanic_earnings_week ON mechanic_earnings(week_start);
CREATE INDEX IF NOT EXISTS idx_mechanic_earnings_paid ON mechanic_earnings(is_paid);

-- 4. Crear tabla de solicitudes de pago (Maestro → Auxiliar)
CREATE TABLE IF NOT EXISTS payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Quién envía el pago (mecánico maestro)
  from_master_id UUID REFERENCES profiles(id) NOT NULL,
  
  -- Quién recibe (mecánico auxiliar)
  to_auxiliary_id UUID REFERENCES profiles(id) NOT NULL,
  
  -- Montos
  total_amount DECIMAL(10,2) NOT NULL,      -- Lo que recibe el auxiliar
  labor_amount DECIMAL(10,2) NOT NULL,      -- Mano de obra total
  
  -- Detalle de órdenes (JSON array)
  orders_summary JSONB DEFAULT '[]',
  
  -- IDs de ganancias incluidas (para marcarlas como pagadas)
  earning_ids UUID[] DEFAULT '{}',
  
  -- Estado
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  
  -- Notas opcionales
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

-- Índices para solicitudes de pago
CREATE INDEX IF NOT EXISTS idx_payment_requests_from_master ON payment_requests(from_master_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_to_auxiliary ON payment_requests(to_auxiliary_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status);

-- =============================================
-- NOTAS:
-- - is_master_mechanic: Permite al mecánico aprobar órdenes de auxiliares
-- - requires_approval: El mecánico debe solicitar aprobación antes de crear órdenes
-- - can_view_approved_orders: Si el auxiliar puede ver sus órdenes después de aprobadas
-- - payment_requests: Permite al maestro enviar pagos que el auxiliar debe aceptar
-- =============================================


-- =============================================
-- MOTOPARTES MANAGER - ESQUEMA DE BASE DE DATOS
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- Limpiar tablas existentes si las hay (con cuidado)
DROP TABLE IF EXISTS order_history CASCADE;
DROP TABLE IF EXISTS order_photos CASCADE;
DROP TABLE IF EXISTS order_parts CASCADE;
DROP TABLE IF EXISTS order_services CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS motorcycles CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS order_statuses CASCADE;
DROP TABLE IF EXISTS whatsapp_sessions CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- =============================================
-- 1. PERFILES DE USUARIO
-- =============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT, -- Para login sin Supabase Auth
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'mechanic', 'admin_mechanic')),
  commission_percentage DECIMAL(5,2) DEFAULT 10.00,
  is_active BOOLEAN DEFAULT true,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar usuario admin por defecto
INSERT INTO profiles (email, password_hash, full_name, phone, role, commission_percentage)
VALUES ('admin@motopartes.com', 'admin123', 'Administrador', '5551234567', 'admin', 0);

-- =============================================
-- 2. CLIENTES (compartidos por todo el taller)
-- =============================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 3. MOTOCICLETAS
-- =============================================
CREATE TABLE motorcycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER,
  plates TEXT,
  color TEXT,
  vin TEXT,
  mileage INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 4. CATÁLOGO DE SERVICIOS
-- =============================================
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  base_price DECIMAL(10,2) NOT NULL,
  category TEXT DEFAULT 'general',
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar servicios por defecto
INSERT INTO services (name, description, base_price, category, display_order) VALUES
('Servicio Completo', 'Revisión general de la moto', 500.00, 'mantenimiento', 1),
('Cambio de Aceite', 'Cambio de aceite de motor', 250.00, 'mantenimiento', 2),
('Afinación', 'Afinación completa del motor', 800.00, 'motor', 3),
('Frenos', 'Revisión y ajuste de frenos', 400.00, 'frenos', 4),
('Sistema Eléctrico', 'Diagnóstico y reparación eléctrica', 350.00, 'electrico', 5),
('Cambio de Llantas', 'Cambio de llantas delanteras o traseras', 150.00, 'general', 6),
('Suspensión', 'Revisión y ajuste de suspensión', 450.00, 'suspension', 7),
('Cadena y Sprockets', 'Limpieza, lubricación o cambio', 200.00, 'general', 8);

-- =============================================
-- 5. ESTADOS DE ÓRDENES
-- =============================================
CREATE TABLE order_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  display_order INTEGER DEFAULT 0,
  is_terminal BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar estados por defecto
INSERT INTO order_statuses (name, description, color, display_order, is_terminal) VALUES
('Registrada', 'Orden recién creada, pendiente de revisión', '#06b6d4', 1, false),
('En Revisión', 'Mecánico revisando la motocicleta', '#f59e0b', 2, false),
('En Reparación', 'Trabajo en progreso', '#8b5cf6', 3, false),
('Lista para Entregar', 'Trabajo terminado, esperando al cliente', '#22c55e', 4, false),
('Entregada', 'Orden finalizada y entregada al cliente', '#10b981', 5, true);

-- =============================================
-- 6. ÓRDENES DE SERVICIO
-- =============================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  
  -- Relaciones
  client_id UUID REFERENCES clients(id),
  motorcycle_id UUID REFERENCES motorcycles(id),
  mechanic_id UUID REFERENCES profiles(id),
  status_id UUID REFERENCES order_statuses(id),
  
  -- Detalles
  customer_complaint TEXT,
  initial_diagnosis TEXT,
  mechanic_notes TEXT,
  
  -- Financiero (en MXN)
  labor_total DECIMAL(10,2) DEFAULT 0,
  parts_total DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) DEFAULT 0,
  advance_payment DECIMAL(10,2) DEFAULT 0,
  is_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  
  -- Portal cliente
  public_token TEXT UNIQUE,
  client_link TEXT,
  client_last_seen_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- =============================================
-- 7. SERVICIOS POR ORDEN
-- =============================================
CREATE TABLE order_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id),
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  quantity INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 8. REFACCIONES/PARTES POR ORDEN
-- =============================================
CREATE TABLE order_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  part_number TEXT,
  cost DECIMAL(10,2) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  quantity INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 9. FOTOS DE ÓRDENES
-- =============================================
CREATE TABLE order_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  category TEXT CHECK (category IN ('before', 'after', 'evidence')),
  caption TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 10. HISTORIAL DE CAMBIOS
-- =============================================
CREATE TABLE order_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES profiles(id),
  old_status TEXT,
  new_status TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 11. CITAS/RECORDATORIOS
-- =============================================
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  motorcycle_id UUID REFERENCES motorcycles(id),
  assigned_mechanic_id UUID REFERENCES profiles(id),
  scheduled_date TIMESTAMPTZ NOT NULL,
  service_type TEXT,
  notes TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled')),
  reminder_sent BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 12. SESIÓN DE WHATSAPP
-- =============================================
CREATE TABLE whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_connected BOOLEAN DEFAULT false,
  phone_number TEXT,
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  last_heartbeat TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar sesión inicial
INSERT INTO whatsapp_sessions (is_connected) VALUES (false);

-- =============================================
-- ÍNDICES PARA MEJOR RENDIMIENTO
-- =============================================
CREATE INDEX idx_orders_mechanic ON orders(mechanic_id);
CREATE INDEX idx_orders_client ON orders(client_id);
CREATE INDEX idx_orders_status ON orders(status_id);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_motorcycles_client ON motorcycles(client_id);
CREATE INDEX idx_order_services_order ON order_services(order_id);
CREATE INDEX idx_order_photos_order ON order_photos(order_id);

-- =============================================
-- FUNCIONES ÚTILES
-- =============================================

-- Función para generar número de orden
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
  year_str TEXT;
  count_num INTEGER;
BEGIN
  year_str := EXTRACT(YEAR FROM NOW())::TEXT;
  SELECT COUNT(*) + 1 INTO count_num 
  FROM orders 
  WHERE order_number LIKE 'OS-' || year_str || '-%';
  RETURN 'OS-' || year_str || '-' || LPAD(count_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Función para actualizar total de orden
CREATE OR REPLACE FUNCTION update_order_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE orders SET
    labor_total = (SELECT COALESCE(SUM(price * quantity), 0) FROM order_services WHERE order_id = NEW.order_id),
    parts_total = (SELECT COALESCE(SUM(price * quantity), 0) FROM order_parts WHERE order_id = NEW.order_id),
    total_amount = (
      (SELECT COALESCE(SUM(price * quantity), 0) FROM order_services WHERE order_id = NEW.order_id) +
      (SELECT COALESCE(SUM(price * quantity), 0) FROM order_parts WHERE order_id = NEW.order_id)
    ),
    updated_at = NOW()
  WHERE id = NEW.order_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para actualizar totales
CREATE TRIGGER update_order_totals_on_service
AFTER INSERT OR UPDATE OR DELETE ON order_services
FOR EACH ROW EXECUTE FUNCTION update_order_totals();

CREATE TRIGGER update_order_totals_on_parts
AFTER INSERT OR UPDATE OR DELETE ON order_parts
FOR EACH ROW EXECUTE FUNCTION update_order_totals();

-- Create whatsapp_sessions table
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number TEXT,
    is_connected BOOLEAN DEFAULT false,
    connected_at TIMESTAMPTZ,
    disconnected_at TIMESTAMPTZ,
    last_heartbeat TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_is_connected ON whatsapp_sessions(is_connected);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_last_heartbeat ON whatsapp_sessions(last_heartbeat);

-- Add RLS (Row Level Security) policies if needed
-- For now, allowing all operations for authenticated users
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Allow service role to do everything (for backend)
CREATE POLICY "Allow service role full access" ON whatsapp_sessions
    FOR ALL
    USING (true);

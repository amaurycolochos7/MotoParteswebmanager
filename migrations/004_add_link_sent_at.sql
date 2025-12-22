-- Migration: Add link_sent_at column to orders table
-- Run this in Supabase SQL Editor

-- Add link_sent_at column to track when client link was sent
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS link_sent_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN orders.link_sent_at IS 'Timestamp when the order link was sent to the client via WhatsApp';

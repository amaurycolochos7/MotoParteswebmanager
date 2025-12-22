-- Migration: Add approved_by column to orders table
-- Run this in Supabase SQL Editor to enable master-auxiliary tracking

-- Add approved_by column to track which master approved auxiliary orders
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id);

-- Add comment for documentation
COMMENT ON COLUMN orders.approved_by IS 'Master mechanic who approved this order (if created by auxiliary)';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_orders_approved_by ON orders(approved_by);

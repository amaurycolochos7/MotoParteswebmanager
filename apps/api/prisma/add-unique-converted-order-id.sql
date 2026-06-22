-- Migration: add unique constraint on quotations.converted_order_id
-- Purpose: prevent duplicate order creation from the same quotation at DB level.
-- Safe: the column is nullable, so NULL values don't conflict.
-- Idempotent: uses IF NOT EXISTS.

CREATE UNIQUE INDEX IF NOT EXISTS "quotations_converted_order_id_key"
ON "quotations"("converted_order_id");

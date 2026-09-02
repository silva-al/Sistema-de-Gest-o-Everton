-- Migração para adicionar campos de pagamento aos pedidos
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'pix',
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS payment_id TEXT,
  ADD COLUMN IF NOT EXISTS pix_copia_cola TEXT,
  ADD COLUMN IF NOT EXISTS pix_qr_code_base64 TEXT;

-- Atualiza pedidos antigos que eventualmente não tenham esses campos
UPDATE orders SET payment_method = 'pix' WHERE payment_method IS NULL;
UPDATE orders SET payment_status = 'pendente' WHERE payment_status IS NULL;

-- Migração para adicionar parcelamento, juros e desconto aos pedidos
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS installments INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS installment_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS card_brand TEXT,
  ADD COLUMN IF NOT EXISTS card_last_four TEXT;

UPDATE orders SET installments = 1 WHERE installments IS NULL;
UPDATE orders SET discount_cents = 0 WHERE discount_cents IS NULL;

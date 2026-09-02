-- Schema do banco de dados da loja de peças.
-- Rode este arquivo uma vez no seu banco Postgres (Supabase: aba "SQL Editor").

CREATE TABLE IF NOT EXISTS customers (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  cpf_cnpj      TEXT,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Garante a coluna também em bancos que já existiam antes desse campo ser criado.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT;

CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT UNIQUE,
  category    TEXT,
  description TEXT,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  stock_qty   INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  photo_url   TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_name ON products USING GIN (to_tsvector('portuguese', name));

CREATE TABLE IF NOT EXISTS customer_addresses (
  id             SERIAL PRIMARY KEY,
  customer_id    INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  cep            TEXT,
  street         TEXT,
  number         TEXT,
  complement     TEXT,
  neighborhood   TEXT,
  city           TEXT,
  state          TEXT,
  is_default     BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  status         TEXT NOT NULL DEFAULT 'novo'
                 CHECK (status IN ('novo','em_preparacao','pronto','entregue','cancelado')),
  address_snapshot JSONB,
  total_cents    INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'pix',
  discount_cents INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Garante as colunas também em bancos que já existiam antes da forma de pagamento ser criada.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'pix';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_cents INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS order_items (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL
);

-- Peças de exemplo para você já testar a loja com dados reais no banco.
INSERT INTO products (name, code, category, description, price_cents, stock_qty, photo_url)
VALUES
  ('Pastilha de freio dianteira', 'PF-1001', 'Freios', 'Aplicação compatível', 18990, 12, NULL),
  ('Bobina de ignição', 'BI-2003', 'Elétrica e ignição', 'Aplicação compatível', 32990, 8, NULL),
  ('Filtro de óleo', 'FO-3010', 'Filtros', 'Aplicação compatível', 4290, 30, NULL)
ON CONFLICT (code) DO NOTHING;

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
ALTER TABLE products ADD COLUMN IF NOT EXISTS compatibility TEXT;
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
  id                      SERIAL PRIMARY KEY,
  customer_id             INTEGER NOT NULL REFERENCES customers(id),
  status                  TEXT NOT NULL DEFAULT 'novo'
                          CHECK (status IN ('novo','em_preparacao','pronto','entregue','cancelado')),
  address_snapshot        JSONB,
  total_cents             INTEGER NOT NULL DEFAULT 0,
  payment_method          TEXT DEFAULT 'pix',
  payment_status          TEXT DEFAULT 'pendente',
  payment_id              TEXT,
  pix_copia_cola          TEXT,
  pix_qr_code_base64      TEXT,
  discount_cents          INTEGER NOT NULL DEFAULT 0,
  installments            INTEGER NOT NULL DEFAULT 1,
  installment_amount_cents INTEGER,
  card_brand              TEXT,
  card_last_four          TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garante as colunas também em bancos que já existiam antes
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'pix';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pendente';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pix_copia_cola TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pix_qr_code_base64 TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS installments INTEGER NOT NULL DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS installment_amount_cents INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS card_brand TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS card_last_four TEXT;

-- Normaliza pedidos antigos que ficaram sem valor nessas colunas.
UPDATE orders SET payment_method = 'pix'      WHERE payment_method IS NULL;
UPDATE orders SET payment_status = 'pendente' WHERE payment_status IS NULL;
UPDATE orders SET installments   = 1          WHERE installments IS NULL;
UPDATE orders SET discount_cents = 0          WHERE discount_cents IS NULL;

-- Consultas por pagamento (usadas pelo webhook do Mercado Pago).
CREATE INDEX IF NOT EXISTS idx_orders_payment_id ON orders (payment_id);

CREATE TABLE IF NOT EXISTS order_items (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL
);

-- Peças de exemplo para você já testar a loja com dados reais no banco.
-- Catálogo oficial de peças da Fahren Motors
INSERT INTO products (name, code, category, description, compatibility, price_cents, stock_qty, photo_url)
VALUES
  ('Pastilha de freio dianteira', 'PF-1001', 'Freios', 'Aplicação compatível de alta durabilidade', 'Universal / Compatível', 18990, 12, 'images/produtos/pastilha.jpg'),
  ('Bobina de ignição', 'BI-2003', 'Elétrica e ignição', 'Aplicação compatível de alta resposta', 'Universal / Compatível', 32990, 8, 'images/produtos/bobina.jpg'),
  ('Filtro de óleo', 'FO-3010', 'Filtros', 'Aplicação compatível blindado', 'Universal / Compatível', 4290, 30, 'images/produtos/filtro.jpg'),
  ('Jogo de Pastilhas de Freio Dianteiras Bosch Cerâmica', 'BOSCH-0986-BR', 'Freios', 'Pastilhas de cerâmica de alta durabilidade, frenagem silenciosa e baixo desprendimento de pó.', 'Volkswagen Gol, Voyage, Fox, Polo, Saveiro (2012 em diante)', 14990, 18, 'images/produtos/pastilha.jpg'),
  ('Par de Discos de Freio Ventilados Dianteiros Fremax Carbon+', 'BD-5290-FRE', 'Freios', 'Discos com acabamento anti-corrosão Pintura Preta e liga de alto carbono.', 'Toyota Corolla, Honda Civic, Chevrolet Cruze', 28900, 12, 'images/categorias/freios.jpg'),
  ('Fluido de Freio DOT 4 LV Bosch Alta Performance 500ml', 'DOT4-BOSCH-500', 'Freios', 'Fluido de freio sintético de baixa viscosidade para ABS e ESP.', 'Universal para sistemas hidráulicos DOT 4 / DOT 4 LV', 4200, 25, 'images/categorias/oleos.jpg'),
  ('Par de Amortecedores Dianteiros Monroe Pressurizados OESpectrum', 'MON-SP089-PR', 'Suspensão', 'Tecnologia exclusiva Twin Technology com estabilidade e conforto superior.', 'Chevrolet Onix, Prisma, Spin, Tracker (2013 a 2019)', 58900, 8, 'images/categorias/suspensao.jpg'),
  ('Kit Batente, Coifa e Coxim do Amortecedor Dianteiro Axios', 'AXIOS-BT021', 'Suspensão', 'Kit de fixação superior da coluna com rolamento integrado.', 'Hyundai HB20, HB20S, Creta 1.6', 8990, 20, 'images/categorias/suspensao.jpg'),
  ('Par de Bieletas da Barra Estabilizadora Dianteira Nakata', 'NAK-BL4102', 'Suspensão', 'Bieletas reforçadas de articulação esférica selada anti-ruído.', 'Honda Civic G9/G10, Fit, City', 11500, 15, 'images/categorias/suspensao.jpg'),
  ('Jogo de 4 Velas de Ignição Iridium NGK Laser', 'NGK-ILZKR7B11', 'Elétrica e ignição', 'Eletrodo ultrafino de Iridium soldado a laser, partida imediata e economia.', 'Honda Civic 1.8/2.0, Fit 1.5, HR-V, City i-VTEC Flex', 22900, 16, 'images/produtos/bobina_2.jpg'),
  ('Bobina de Ignição Eletrônica Magneti Marelli Individual', 'MM-BI0048', 'Elétrica e ignição', 'Bobina tipo caneta com isolamento térmico de alta densidade.', 'Volkswagen Gol, Fox, Voyage, Saveiro 1.6 MSI e EA211', 27950, 10, 'images/produtos/bobina.jpg'),
  ('Motor de Partida / Arranque Remanufaturado Original Valeo 12V', 'VAL-MP1201', 'Elétrica e ignição', 'Motor de arranque de alto torque e partida suave certificado.', 'Fiat Palio, Uno, Siena, Strada motores Fire 1.0 e 1.4', 46000, 5, 'images/categorias/eletrica.jpg'),
  ('Kit Revisão 4 Filtros (Óleo + Ar + Combustível + Cabine) Mann-Filter', 'MANN-KIT4-VW', 'Filtros', 'Kit completo para revisão periódica com filtros de alta eficiência.', 'Volkswagen Polo, Virtus, Nivus, T-Cross motores 1.0 200 TSI', 16890, 22, 'images/produtos/filtro.jpg'),
  ('Filtro de Ar Condicionado / Cabine com Carvão Ativado Mahle', 'MAHLE-LAK855', 'Filtros', 'Filtro antialérgico com camada tripla de carvão ativado contra odores.', 'Jeep Renegade, Compass, Fiat Toro, Argo, Cronos', 5490, 35, 'images/categorias/filtros.jpg'),
  ('Filtro de Combustível Injeção Eletrônica Blindado Tecfil', 'TECFIL-GI50/7', 'Filtros', 'Corpo blindado em aço inox resistente à corrosão do etanol.', 'Chevrolet Celta, Corsa, Montana, Agile, Astra Flex', 3800, 40, 'images/categorias/filtros.jpg'),
  ('Kit Correia Dentada e Tensor Gates PowerGrip', 'GATES-KS104', 'Correias', 'Kit sincronizador mestre com correia de alta resistência térmica.', 'Motores GM Família 1 - Onix, Prisma, Cobalt, Spin 1.0, 1.4 e 1.8', 19550, 14, 'images/categorias/correias.jpg'),
  ('Correia do Alternador Poly-V Continental Contitech EPDM', 'CONT-6PK1825', 'Correias', 'Correia de acessórios em borracha EPDM anti-ruído de alta tração.', 'Ford Ka, Fiesta, Ecosport motores 1.5 e 1.6 Sigma', 7800, 25, 'images/categorias/correias.jpg'),
  ('Sonda Lambda Sensor de Oxigênio Pré-Catalisador Bosch Planar', 'BOSCH-025801', 'Sensores e injeção', 'Sensor aquecido de 4 fios com cerâmica de resposta rápida.', 'Volkswagen, Fiat, Chevrolet e Ford motores 1.0 e 1.6 Flex', 31000, 9, 'images/categorias/sensores.jpg'),
  ('Sensor de Rotação do Virabrequim Hall Magneti Marelli', 'MM-SR0109', 'Sensores e injeção', 'Sensor magnético de alta precisão para controle da injeção e ignição.', 'Ford Ka 1.0 3C Ti-VCT, Ecosport, Fiesta Rocam', 13900, 12, 'images/categorias/sensores.jpg'),
  ('Óleo de Motor 100% Sintético Motul 8100 X-cess 5W-40 1L', 'MOTUL-8100-5W40', 'Óleos e fluidos', 'Lubrificante sintético premium de alto desempenho e proteção extrema.', 'VW 502.00, MB 229.5, BMW LL-01, Porsche A40, Renault RN0710', 6800, 50, 'images/categorias/oleos.jpg'),
  ('Aditivo de Radiador Concentrado Orgânico Tirreno Long Life 1L', 'TIRR-LL-ORG1', 'Óleos e fluidos', 'Fluido protetor anticorrosivo com tecnologia OAT para sistemas de arrefecimento.', 'Universal para sistemas de arrefecimento nacionais e importados', 3690, 30, 'images/categorias/oleos.jpg'),
  ('Par de Lâmpadas H7 Philips CrystalVision Ultra 4300K Branco Nobre', 'PHIL-H7-CVU', 'Iluminação', 'Efeito xênon elegante de 4300K com vidro de quartzo UV-Block.', 'Encaixe universal H7 (Farol baixo ou alto)', 15990, 18, 'images/categorias/iluminacao.jpg'),
  ('Kit Par de Lâmpadas LED Osram LEDriving H4 6000K Branco Frio', 'OSRAM-LED-H4', 'Iluminação', 'Linha de corte perfeita, dissipador em alumínio aeronáutico e 50% menos consumo.', 'Encaixe universal H4 Farol Alto/Baixo Integrado (12V)', 34900, 7, 'images/categorias/iluminacao.jpg')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  compatibility = EXCLUDED.compatibility,
  price_cents = EXCLUDED.price_cents,
  stock_qty = EXCLUDED.stock_qty,
  photo_url = EXCLUDED.photo_url,
  active = true;

-- Admin padrão do sistema: login "admin" / senha "admin"
-- O hash abaixo é bcrypt('admin', 10 rounds).
INSERT INTO admins (name, email, password_hash)
VALUES ('admin', 'admin@fahrenmotors.com', '$2a$10$jdILRdQycbv51/aHwJ.ZcOczyGDwRylyusDLV/iEvkWAP5b3MDQeK')
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  password_hash = EXCLUDED.password_hash;

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const db = require('./db');

const authRoutes = require('./routes/auth');
const adminAuthRoutes = require('./routes/admin-auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const addressRoutes = require('./routes/addresses');
const paymentRoutes = require('./routes/payments');
const vehicleRoutes = require('./routes/vehicles');
const uploadRoutes = require('./routes/uploads');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// API
app.use('/api/auth', authRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/uploads', uploadRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Front-end estático: loja do cliente na raiz, painel de gestão em /admin
app.use(express.static(path.join(__dirname, '..', 'public', 'loja')));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));
// Fotos de peças enviadas pelo painel (POST /api/uploads gera URLs /uploads/products/...).
// ATENÇÃO: no plano grátis do Render o disco é temporário — as imagens somem a cada
// deploy/restart. Para produção, trocar por um storage externo (ex.: Supabase Storage).
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));

// Sempre que o servidor liga, garante que o banco de dados tem todas as
// tabelas/colunas mais recentes (comandos "CREATE TABLE IF NOT EXISTS" e
// "ADD COLUMN IF NOT EXISTS" — não apaga nem altera dados existentes).
// Assim, novas mudanças de estrutura entram sozinhas a cada deploy, sem
// precisar rodar nenhum comando manual no Render.
async function ensureDatabaseSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(schema);
  console.log('Estrutura do banco de dados verificada/atualizada.');
}

const PORT = process.env.PORT || 3000;
ensureDatabaseSchema()
  .catch((err) => {
    console.error('Falha ao atualizar a estrutura do banco de dados:', err);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Fahren Parts rodando em http://localhost:${PORT}`);
      console.log(`Painel de gestão em http://localhost:${PORT}/admin`);
    });
  });

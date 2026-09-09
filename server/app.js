// O aplicativo Express (rotas, middlewares e entrega de arquivos estáticos).
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const adminAuthRoutes = require('./routes/admin-auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const addressRoutes = require('./routes/addresses');
const vehicleRoutes = require('./routes/vehicles');
const paymentRoutes = require('./routes/payments');
const uploadRoutes = require('./routes/uploads');
const stockRoutes = require('./routes/stock');

const app = express();

app.set('trust proxy', 1);

// Origens permitidas para CORS
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);

// Cabeçalhos de segurança
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Limite de tamanho no corpo da requisição
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

// ---- API ----
app.use('/api/auth', authRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/admin/upload', uploadRoutes);
app.use('/api/stock', stockRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---- Arquivos estáticos ----
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));

const noCacheStaticOpts = {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  },
};

// Permite servir tanto pela raiz / quanto por /loja (garantindo compatibilidade total para /loja/images/...)
app.use('/loja', express.static(path.join(__dirname, '..', 'public', 'loja')));
app.use(express.static(path.join(__dirname, '..', 'public', 'loja')));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin'), noCacheStaticOpts));

// Tratador de erro final. Sem ele, um erro não previsto (JSON malformado, por
// exemplo) faz o Express devolver uma página HTML com o rastro completo do
// código — que mostra caminhos de arquivo e a estrutura interna do servidor
// para quem estiver bisbilhotando. Aqui o cliente recebe só uma mensagem curta,
// e o detalhe fica no log do servidor.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[Erro não tratado]', req.method, req.originalUrl, err);
  if (res.headersSent) return;
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({ error: 'Requisição inválida.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Conteúdo enviado é grande demais.' });
  }
  res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
});

module.exports = app;

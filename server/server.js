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
const vehicleRoutes = require('./routes/vehicles');
const paymentRoutes = require('./routes/payments');
const uploadRoutes = require('./routes/uploads');

const app = express();

// Atrás do proxy do Render, para o IP real do cliente chegar nos limitadores
// de tentativa de login e o cookie "secure" funcionar.
app.set('trust proxy', 1);

// A loja e a API são servidas pelo MESMO endereço, então o navegador nem precisa
// de CORS. Antes estava `origin: true`, que devolve "pode" para QUALQUER site —
// combinado com `credentials: true`, um site malicioso poderia ler dados da conta
// do cliente logado. Agora só liberamos origens declaradas em CORS_ORIGINS
// (separadas por vírgula), e o padrão é não liberar nenhuma outra.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Sem Origin = mesma origem, app nativo ou curl: segue normalmente.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);

// Cabeçalhos básicos de segurança (sem dependência nova).
app.use((_req, res, next) => {
  // Impede o navegador de "adivinhar" o tipo do arquivo (evita XSS via upload).
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Impede que a loja seja embutida num iframe de outro site (clickjacking).
  res.setHeader('X-Frame-Options', 'DENY');
  // Não vaza a URL da loja (com dados na query) para sites de terceiros.
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Limite de tamanho no corpo da requisição: sem isso, um POST gigante pode
// derrubar o servidor (o padrão do Express já é 100kb, aqui fica explícito).
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

// API
app.use('/api/auth', authRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/admin/upload', uploadRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Arquivos estáticos:
// 1. Fotos de peças enviadas no painel
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));

// 2. Loja do cliente na raiz, painel de gestão em /admin
app.use(express.static(path.join(__dirname, '..', 'public', 'loja')));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));

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

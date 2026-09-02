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
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin/upload', uploadRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Arquivos estáticos
// 1. Uploads (fotos de peças enviadas no painel)
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));

// 2. Loja do cliente na raiz e painel de gestão em /admin
app.use(express.static(path.join(__dirname, '..', 'public', 'loja')));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Fahren Parts rodando em http://localhost:${PORT}`);
  console.log(`Painel de gestão em http://localhost:${PORT}/admin`);
});

// Login de ADMIN (equipe da oficina). Não existe cadastro público de admin por segurança:
// admins são criados pelo script server/init-db.js (veja README).
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { setAuthCookie, clearAuthCookie, requireRole } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();

// O painel dá acesso aos dados de TODOS os clientes, então a trava aqui é mais
// apertada que a da loja: 5 erros a cada 15 minutos por IP.
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  countOnlyFailures: true,
  message: 'Muitas tentativas de login. Aguarde alguns minutos e tente de novo.',
});

router.post('/login', adminLoginLimiter, async (req, res) => {
  try {
    const { login, username, email, password } = req.body || {};
    const userIdentifier = (login || username || email || '').trim().toLowerCase();
    if (!userIdentifier || !password) {
      return res.status(400).json({ error: 'Informe usuário e senha.' });
    }
    const result = await db.query(
      `SELECT * FROM admins 
       WHERE LOWER(email) = $1 
          OR LOWER(email) = $2 
          OR LOWER(email) = $3 
          OR LOWER(name) = $1
       ORDER BY id ASC LIMIT 1`,
      [userIdentifier, userIdentifier + '@fahrenmotors.com', userIdentifier + '@fahrenparts.com']
    );
    const admin = result.rows[0];
    if (!admin) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    setAuthCookie(res, { sub: admin.id, role: 'admin', name: admin.name, email: admin.email });
    res.json({ admin: { id: admin.id, name: admin.name, email: admin.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao entrar.' });
  }
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireRole('admin'), async (req, res) => {
  const result = await db.query('SELECT id, name, email FROM admins WHERE id = $1', [req.user.sub]);
  res.json({ admin: result.rows[0] || null });
});

module.exports = router;

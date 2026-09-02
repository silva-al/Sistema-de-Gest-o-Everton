// Login de ADMIN (equipe da oficina). Não existe cadastro público de admin por segurança:
// admins são criados pelo script server/init-db.js (veja README).
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { setAuthCookie, clearAuthCookie, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Informe e-mail e senha.' });
    }
    const result = await db.query('SELECT * FROM admins WHERE email = $1', [email.toLowerCase()]);
    const admin = result.rows[0];
    if (!admin) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
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

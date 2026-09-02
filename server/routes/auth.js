// Cadastro e login de CLIENTES. Senhas nunca são salvas em texto puro (bcrypt).
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { setAuthCookie, clearAuthCookie, requireRole } = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^\S+@\S+\.\S+$/;

router.post('/register', async (req, res) => {
  try {
    const { name, phone, email, password, cpfCnpj } = req.body || {};
    if (!name || !phone || !email || !password) {
      return res.status(400).json({ error: 'Preencha todos os campos do cadastro.' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Digite um e-mail válido.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    const existing = await db.query('SELECT id FROM customers WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.query(
      `INSERT INTO customers (name, email, phone, cpf_cnpj, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, phone, cpf_cnpj`,
      [name.trim(), email.toLowerCase(), phone.trim(), cpfCnpj?.trim() || null, passwordHash]
    );
    const customer = result.rows[0];
    setAuthCookie(res, { sub: customer.id, role: 'customer', name: customer.name, email: customer.email });
    res.status(201).json({ customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, cpfCnpj: customer.cpf_cnpj } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar cadastro.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Informe e-mail e senha.' });
    }
    const result = await db.query('SELECT * FROM customers WHERE email = $1', [email.toLowerCase()]);
    const customer = result.rows[0];
    if (!customer) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }
    const ok = await bcrypt.compare(password, customer.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }
    setAuthCookie(res, { sub: customer.id, role: 'customer', name: customer.name, email: customer.email });
    res.json({ customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, cpfCnpj: customer.cpf_cnpj } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao entrar na conta.' });
  }
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireRole('customer'), async (req, res) => {
  try {
    const result = await db.query('SELECT id, name, email, phone, cpf_cnpj FROM customers WHERE id = $1', [req.user.sub]);
    const c = result.rows[0];
    res.json({ customer: c ? { id: c.id, name: c.name, email: c.email, phone: c.phone, cpfCnpj: c.cpf_cnpj } : null });
  } catch (err) {
    console.error('[Auth:me]', err);
    res.status(500).json({ error: 'Erro ao carregar dados do cliente.' });
  }
});

router.put('/me', requireRole('customer'), async (req, res) => {
  try {
    const { name, email, cpfCnpj } = req.body || {};
    const result = await db.query(
      `UPDATE customers SET
         name = COALESCE($1, name),
         email = COALESCE($2, email),
         cpf_cnpj = COALESCE($3, cpf_cnpj)
       WHERE id = $4 RETURNING id, name, email, phone, cpf_cnpj`,
      [name?.trim(), email?.trim().toLowerCase(), cpfCnpj?.trim(), req.user.sub]
    );
    const c = result.rows[0];
    res.json({ customer: { id: c.id, name: c.name, email: c.email, phone: c.phone, cpfCnpj: c.cpf_cnpj } });
  } catch (err) {
    console.error('[Auth:updateMe]', err);
    res.status(500).json({ error: 'Erro ao atualizar dados.' });
  }
});

module.exports = router;

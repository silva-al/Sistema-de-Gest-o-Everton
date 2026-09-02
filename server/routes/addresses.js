// Endereço de entrega do cliente (o preenchimento automático pelo CEP continua no front-end,
// via API pública do ViaCEP — aqui só salvamos o resultado no banco).
const express = require('express');
const db = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/mine', requireRole('customer'), async (req, res) => {
  const result = await db.query(
    'SELECT * FROM customer_addresses WHERE customer_id = $1 AND is_default = true LIMIT 1',
    [req.user.sub]
  );
  res.json({ address: result.rows[0] || null });
});

router.post('/mine', requireRole('customer'), async (req, res) => {
  const { cep, street, number, complement, neighborhood, city, state } = req.body || {};
  if (!cep || !street || !number || !neighborhood || !city || !state) {
    return res.status(400).json({ error: 'Preencha os dados obrigatórios do endereço.' });
  }
  await db.query('UPDATE customer_addresses SET is_default = false WHERE customer_id = $1', [req.user.sub]);
  const result = await db.query(
    `INSERT INTO customer_addresses (customer_id, cep, street, number, complement, neighborhood, city, state, is_default)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING *`,
    [req.user.sub, cep, street, number, complement || null, neighborhood, city, state.toUpperCase()]
  );
  res.status(201).json({ address: result.rows[0] });
});

module.exports = router;

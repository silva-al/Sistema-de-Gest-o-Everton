// Rotas de pagamentos
const express = require('express');
const db = require('../db');
const { requireRole, readToken } = require('../middleware/auth');
const {
  createPixPayment,
  checkPaymentStatus,
  markPaymentApproved,
  calculateInstallments,
  calculatePixAmount,
} = require('../services/payment-service');

const router = express.Router();

// Tabela de parcelas e desconto Pix para um valor
router.get('/installments', (req, res) => {
  const amount = Number(req.query.amount) || 0;
  const installments = calculateInstallments(amount);
  const pix = calculatePixAmount(amount);
  res.json({ installments, pix });
});

// Gera Pix para um pedido
router.post('/pix/:orderId', async (req, res) => {
  try {
    const user = readToken(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado.' });

    const orderId = req.params.orderId;
    const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const order = orderRes.rows[0];

    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
    if (user.role === 'customer' && String(order.customer_id) !== String(user.sub)) {
      return res.status(403).json({ error: 'Acesso negado ao pedido.' });
    }

    const customerRes = await db.query('SELECT * FROM customers WHERE id = $1', [order.customer_id]);
    const customer = customerRes.rows[0] || { name: 'Cliente', email: user.email };

    const payment = await createPixPayment(order, customer);
    res.json({ payment });
  } catch (err) {
    console.error('[Route:Payments:pix]', err);
    res.status(500).json({ error: err.message || 'Erro ao gerar Pix.' });
  }
});

// Checa status do pagamento (usado pelo polling no front-end da loja)
router.get('/:orderId/status', async (req, res) => {
  try {
    const statusData = await checkPaymentStatus(req.params.orderId);
    res.json(statusData);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// Simula aprovação de pagamento (para testes em desenvolvimento)
router.post('/:orderId/simulate-approval', async (req, res) => {
  try {
    const order = await markPaymentApproved(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
    res.json({ ok: true, status: 'aprovado', orderStatus: order.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook Mercado Pago
router.post('/webhook', async (req, res) => {
  try {
    const { action, data } = req.body || {};
    if (data && data.id) {
      const paymentId = String(data.id);
      const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
      if (token) {
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (mpRes.ok) {
          const mpData = await mpRes.json();
          if (mpData.status === 'approved') {
            await db.query(
              `UPDATE orders SET
                 payment_status = 'aprovado',
                 status = CASE WHEN status = 'novo' THEN 'em_preparacao' ELSE status END,
                 updated_at = now()
               WHERE payment_id = $1`,
              [paymentId]
            );
          }
        }
      }
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('[Payment:Webhook] Erro:', err);
    res.status(200).send('OK');
  }
});

module.exports = router;

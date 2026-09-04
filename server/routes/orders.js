// Pedidos: cliente cria pedido a partir do carrinho; admin acompanha e muda o status.
const express = require('express');
const db = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const PAYMENT_METHODS = ['pix', 'cartao', 'retirada'];
const PAYMENT_LABELS = { pix: 'Pix', cartao: 'Cartão de Crédito', retirada: 'Retirada/Entrega' };
const PIX_DISCOUNT_RATE = 0.04; // 4% de desconto pagando no Pix

function serializeOrder(row, items) {
  return {
    id: row.id,
    status: row.status,
    total: Math.round(row.total_cents) / 100,
    discount: Math.round(row.discount_cents || 0) / 100,
    paymentMethod: row.payment_method || 'retirada',
    paymentMethodLabel: PAYMENT_LABELS[row.payment_method] || PAYMENT_LABELS.retirada,
    address: row.address_snapshot,
    createdAt: row.created_at,
    items: (items || []).map((i) => ({
      productId: i.product_id,
      name: i.name,
      quantity: i.quantity,
      unitPrice: Math.round(i.unit_price_cents) / 100,
    })),
  };
}

// Cliente cria um pedido a partir dos itens do carrinho.
// body: { items: [{ productId, quantity }], paymentMethod: 'pix'|'cartao'|'retirada' }
router.post('/', requireRole('customer'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { items, paymentMethod: rawPaymentMethod } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'O carrinho está vazio.' });
    }
    const paymentMethod = PAYMENT_METHODS.includes(rawPaymentMethod) ? rawPaymentMethod : 'retirada';

    await client.query('BEGIN');

    const addressResult = await client.query(
      'SELECT * FROM customer_addresses WHERE customer_id = $1 AND is_default = true LIMIT 1',
      [req.user.sub]
    );
    const address = addressResult.rows[0] || null;

    let subtotalCents = 0;
    const lineItems = [];
    for (const item of items) {
      const productResult = await client.query('SELECT * FROM products WHERE id = $1 AND active = true FOR UPDATE', [
        item.productId,
      ]);
      const product = productResult.rows[0];
      if (!product) throw Object.assign(new Error(`Peça ${item.productId} não encontrada.`), { status: 404 });
      const qty = Number(item.quantity) || 1;
      if (product.stock_qty < qty) {
        throw Object.assign(new Error(`Estoque insuficiente para "${product.name}".`), { status: 409 });
      }
      subtotalCents += product.price_cents * qty;
      lineItems.push({ product, qty });
    }

    const discountCents = paymentMethod === 'pix' ? Math.round(subtotalCents * PIX_DISCOUNT_RATE) : 0;
    const totalCents = subtotalCents - discountCents;

    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, status, address_snapshot, total_cents, payment_method, discount_cents)
       VALUES ($1, 'novo', $2, $3, $4, $5) RETURNING *`,
      [req.user.sub, address ? JSON.stringify(address) : null, totalCents, paymentMethod, discountCents]
    );
    const order = orderResult.rows[0];

    for (const { product, qty } of lineItems) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES ($1,$2,$3,$4)',
        [order.id, product.id, qty, product.price_cents]
      );
      await client.query('UPDATE products SET stock_qty = stock_qty - $1 WHERE id = $2', [qty, product.id]);
    }

    await client.query('COMMIT');

    const items2 = lineItems.map(({ product, qty }) => ({
      product_id: product.id,
      name: product.name,
      quantity: qty,
      unit_price_cents: product.price_cents,
    }));
    res.status(201).json({ order: serializeOrder(order, items2) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Erro ao criar pedido.' });
  } finally {
    client.release();
  }
});

router.get('/mine', requireRole('customer'), async (req, res) => {
  const orders = await db.query('SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC', [
    req.user.sub,
  ]);
  const results = [];
  for (const order of orders.rows) {
    const items = await db.query(
      `SELECT oi.*, p.name FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE order_id = $1`,
      [order.id]
    );
    results.push(serializeOrder(order, items.rows));
  }
  res.json({ orders: results });
});

// ---- Admin: ver todos os pedidos e mudar status ----

router.get('/', requireRole('admin'), async (req, res) => {
  const { status } = req.query;
  const params = [];
  let sql = `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone FROM orders o
             JOIN customers c ON c.id = o.customer_id`;
  if (status) {
    params.push(status);
    sql += ` WHERE o.status = $1`;
  }
  sql += ' ORDER BY o.created_at DESC';
  const orders = await db.query(sql, params);

  const results = [];
  for (const order of orders.rows) {
    const items = await db.query(
      `SELECT oi.*, p.name FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE order_id = $1`,
      [order.id]
    );
    results.push({
      ...serializeOrder(order, items.rows),
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
    });
  }
  res.json({ orders: results });
});

const VALID_STATUSES = ['novo', 'em_preparacao', 'pronto', 'entregue', 'cancelado'];

router.put('/:id/status', requireRole('admin'), async (req, res) => {
  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }
  const result = await db.query(
    'UPDATE orders SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
    [status, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Pedido não encontrado.' });
  res.json({ order: serializeOrder(result.rows[0], []) });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const orderRes = await client.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!orderRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }
    const order = orderRes.rows[0];

    // Se o pedido não estava cancelado, devolve os itens ao estoque
    if (order.status !== 'cancelado') {
      const itemsRes = await client.query('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]);
      for (const item of itemsRes.rows) {
        await client.query(
          'UPDATE products SET stock_qty = stock_qty + $1, in_stock = true WHERE id = $2',
          [item.quantity, item.product_id]
        );
      }
    }

    await client.query('DELETE FROM order_items WHERE order_id = $1', [req.params.id]);
    await client.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ ok: true, message: 'Pedido excluído com sucesso.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao excluir pedido:', err);
    res.status(500).json({ error: 'Erro ao excluir pedido.' });
  } finally {
    client.release();
  }
});

module.exports = router;

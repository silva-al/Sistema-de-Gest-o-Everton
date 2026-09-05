// Catálogo de peças: busca pública (com filtros avançados) + CRUD restrito ao admin.
const express = require('express');
const db = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

function toCents(reais) {
  return Math.round(Number(reais) * 100);
}
function toReais(cents) {
  return Math.round(cents) / 100;
}
function serialize(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    category: row.category,
    description: row.description,
    compatibility: row.compatibility,
    price: toReais(row.price_cents),
    stockQty: row.stock_qty,
    inStock: row.stock_qty > 0,
    photoUrl: row.photo_url,
    active: row.active,
  };
}

// GET /api/products?q=&category=&min_price=&max_price=&in_stock=true
// Busca avançada: texto (nome/código), categoria, faixa de preço, disponibilidade.
const { syncCatalog } = require('../sync-catalog');

router.get('/', async (req, res) => {
  try {
    // Garante sincronização inicial do catálogo se o banco estiver vazio ou desatualizado
    await syncCatalog();

    const { q, category, min_price, max_price, in_stock } = req.query;
    const clauses = ['active = true'];
    const params = [];

    if (q) {
      params.push(`%${q.trim()}%`);
      clauses.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length} OR compatibility ILIKE $${params.length} OR description ILIKE $${params.length} OR category ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      clauses.push(`category = $${params.length}`);
    }
    if (min_price) {
      params.push(toCents(min_price));
      clauses.push(`price_cents >= $${params.length}`);
    }
    if (max_price) {
      params.push(toCents(max_price));
      clauses.push(`price_cents <= $${params.length}`);
    }
    if (in_stock === 'true') {
      clauses.push('stock_qty > 0');
    } else if (in_stock === 'false') {
      clauses.push('stock_qty = 0');
    }

    const sql = `SELECT * FROM products WHERE ${clauses.join(' AND ')} ORDER BY name ASC`;
    const result = await db.query(sql, params);
    res.json({ products: result.rows.map(serialize) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar peças.' });
  }
});

router.post('/sync-catalog', async (_req, res) => {
  try {
    await syncCatalog(true);
    res.json({ ok: true, message: 'Catálogo sincronizado com sucesso.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao sincronizar catálogo.' });
  }
});

router.get('/categories', async (_req, res) => {
  try {
    const result = await db.query(`
      SELECT category, COUNT(*)::int AS count
      FROM products
      WHERE category IS NOT NULL AND active = true
      GROUP BY category
      ORDER BY category
    `);
    res.json({
      categories: result.rows.map((r) => ({
        name: r.category,
        count: r.count,
      })),
      names: result.rows.map((r) => r.category),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar categorias.' });
  }
});

// Uma peça real (nome + foto) para representar cada categoria — usado nos cards
// de "Categorias" da tela inicial, que mostram sempre peças que já estão
// cadastradas para venda (nunca um nome ou foto genérico da categoria).
// Prioriza a peça com foto cadastrada; sem foto, o site usa uma foto padrão da categoria.
router.get('/categories/featured', async (_req, res) => {
  try {
    const result = await db.query(`
      SELECT id, name, code, category, description, compatibility, price_cents, stock_qty, photo_url, active
      FROM products
      WHERE active = true
      ORDER BY updated_at DESC, id ASC
      LIMIT 40
    `);
    const list = result.rows.map(serialize);
    res.json({ categories: list, products: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar peças em destaque.' });
  }
});

router.get('/:id', async (req, res) => {
  const result = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Peça não encontrada.' });
  res.json({ product: serialize(result.rows[0]) });
});

// ---- Rotas de gestão (somente admin) ----

router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { name, code, category, description, compatibility, price, stockQty, photoUrl } = req.body || {};
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Nome e preço são obrigatórios.' });
    }
    const result = await db.query(
      `INSERT INTO products (name, code, category, description, compatibility, price_cents, stock_qty, photo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name.trim(), code || null, category || null, description || null, compatibility || null, toCents(price), stockQty || 0, photoUrl || null]
    );
    res.status(201).json({ product: serialize(result.rows[0]) });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(409).json({ error: 'Já existe uma peça com esse código.' });
    res.status(500).json({ error: 'Erro ao cadastrar peça.' });
  }
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, code, category, description, compatibility, price, stockQty, photoUrl, active } = req.body || {};
    const result = await db.query(
      `UPDATE products SET
         name = COALESCE($1, name),
         code = COALESCE($2, code),
         category = COALESCE($3, category),
         description = COALESCE($4, description),
         compatibility = COALESCE($5, compatibility),
         price_cents = COALESCE($6, price_cents),
         stock_qty = COALESCE($7, stock_qty),
         photo_url = COALESCE($8, photo_url),
         active = COALESCE($9, active),
         updated_at = now()
       WHERE id = $10 RETURNING *`,
      [
        name?.trim() ?? null,
        code ?? null,
        category ?? null,
        description ?? null,
        compatibility ?? null,
        price !== undefined ? toCents(price) : null,
        stockQty !== undefined ? stockQty : null,
        photoUrl ?? null,
        active !== undefined ? active : null,
        req.params.id,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Peça não encontrada.' });
    res.json({ product: serialize(result.rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar peça.' });
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    try {
      const del = await db.query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id]);
      if (del.rows.length) return res.json({ ok: true, deleted: true });
    } catch (e) {
      // Se estiver vinculado a pedidos, desativa para preservar histórico contábil
      const result = await db.query('UPDATE products SET active = false WHERE id = $1 RETURNING id', [req.params.id]);
      if (result.rows.length) return res.json({ ok: true, deactivated: true });
    }
    res.status(404).json({ error: 'Peça não encontrada.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir peça.' });
  }
});

module.exports = router;

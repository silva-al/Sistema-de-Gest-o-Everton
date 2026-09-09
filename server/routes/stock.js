// Rotas operacionais do WMS: Movimentações, Operações, Inventário e Alertas
const express = require('express');
const db = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// -------------------------------------------------------------------
// 1. HISTÓRICO DE MOVIMENTAÇÕES DE ESTOQUE
// -------------------------------------------------------------------
router.get('/movements', requireRole('admin'), async (req, res) => {
  try {
    const { productId, type, limit = 150, days } = req.query;
    const params = [];
    let sql = `
      SELECT 
        sm.*,
        p.name AS product_name,
        p.code AS product_code,
        p.category AS product_category,
        p.photo_url AS product_photo,
        p.location AS current_location,
        p.stock_qty AS current_stock
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      WHERE 1=1
    `;

    if (productId) {
      params.push(productId);
      sql += ` AND sm.product_id = $${params.length}`;
    }

    if (type && type !== 'todos') {
      params.push(type);
      sql += ` AND sm.type = $${params.length}`;
    }

    if (days && Number(days) > 0) {
      params.push(Number(days));
      sql += ` AND sm.created_at >= now() - ($${params.length} || ' days')::interval`;
    }

    sql += ' ORDER BY sm.created_at DESC';
    params.push(Number(limit) || 150);
    sql += ` LIMIT $${params.length}`;

    const result = await db.query(sql, params);

    // Resumo de contadores gerais (hoje / total recente)
    const statsRes = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE type = 'entrada') AS total_entradas,
        COUNT(*) FILTER (WHERE type = 'saida') AS total_saidas,
        COUNT(*) FILTER (WHERE type = 'transferencia') AS total_transferencias,
        COUNT(*) FILTER (WHERE type = 'ajuste' OR type = 'inventario') AS total_ajustes,
        COALESCE(SUM(ABS(quantity)) FILTER (WHERE type = 'entrada'), 0) AS volume_entradas,
        COALESCE(SUM(ABS(quantity)) FILTER (WHERE type = 'saida'), 0) AS volume_saidas
      FROM stock_movements
      WHERE created_at >= now() - interval '30 days'
    `);

    res.json({
      movements: result.rows,
      stats: statsRes.rows[0] || {}
    });
  } catch (err) {
    console.error('Erro ao buscar movimentações:', err);
    res.status(500).json({ error: 'Erro ao carregar movimentações de estoque.' });
  }
});

// -------------------------------------------------------------------
// 2. OPERAÇÃO RÁPIDA (Entrada, Saída, Transferência, Ajuste)
// -------------------------------------------------------------------
router.post('/operations', requireRole('admin'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const {
      productId,
      type,
      quantity,
      fromLocation,
      toLocation,
      reference,
      notes,
      newStockVal
    } = req.body || {};

    const validTypes = ['entrada', 'saida', 'transferencia', 'ajuste', 'inventario'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Tipo de operação inválido.' });
    }

    if (!productId) {
      return res.status(400).json({ error: 'Peça não informada.' });
    }

    await client.query('BEGIN');

    const prodRes = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [productId]);
    if (!prodRes.rows.length) {
      throw Object.assign(new Error('Peça não encontrada.'), { status: 404 });
    }
    const product = prodRes.rows[0];
    const prevStock = Number(product.stock_qty) || 0;
    const curLoc = product.location || 'Sem localização';

    let newStock = prevStock;
    let qtyChange = 0;
    let fromLoc = fromLocation || curLoc;
    let toLoc = toLocation || curLoc;

    if (type === 'entrada') {
      const q = Math.max(1, parseInt(quantity, 10) || 1);
      newStock = prevStock + q;
      qtyChange = q;
    } else if (type === 'saida') {
      const q = Math.max(1, parseInt(quantity, 10) || 1);
      newStock = Math.max(0, prevStock - q);
      qtyChange = -q;
    } else if (type === 'ajuste') {
      if (newStockVal !== undefined && newStockVal !== null) {
        newStock = Math.max(0, parseInt(newStockVal, 10) || 0);
        qtyChange = newStock - prevStock;
      } else {
        const q = parseInt(quantity, 10) || 0;
        newStock = Math.max(0, prevStock + q);
        qtyChange = q;
      }
    } else if (type === 'transferencia') {
      toLoc = (toLocation || curLoc).trim();
      const q = parseInt(quantity, 10) || prevStock;
      qtyChange = q;
    }

    // Atualiza tabela de produtos (Single Source of Truth)
    await client.query(
      'UPDATE products SET stock_qty = $1, location = $2, updated_at = now() WHERE id = $3',
      [newStock, toLoc, product.id]
    );

    // Registra linha no histórico central
    const movRes = await client.query(
      `INSERT INTO stock_movements
        (product_id, type, quantity, previous_stock, new_stock, from_location, to_location, user_name, reference, notes)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        product.id,
        type,
        qtyChange,
        prevStock,
        newStock,
        fromLoc,
        toLoc,
        req.user?.name || 'Administrador',
        reference || (type === 'transferencia' ? `Movido para ${toLoc}` : `Operação de ${type}`),
        notes || null
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      ok: true,
      movement: movRes.rows[0],
      product: {
        ...product,
        stock_qty: newStock,
        location: toLoc
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro na operação de estoque:', err);
    res.status(err.status || 500).json({ error: err.message || 'Erro ao processar operação de estoque.' });
  } finally {
    client.release();
  }
});

// -------------------------------------------------------------------
// 3. CENTRAL DE ALERTAS & ESTOQUE CRÍTICO
// -------------------------------------------------------------------
router.get('/alerts', requireRole('admin'), async (_req, res) => {
  try {
    // 1. Críticos (zerados)
    const criticosRes = await db.query(
      `SELECT id, name, code, category, price_cents, stock_qty, location, photo_url
       FROM products 
       WHERE stock_qty <= 0 AND active = true 
       ORDER BY name ASC`
    );

    // 2. Baixo estoque (entre 1 e 5 un)
    const baixosRes = await db.query(
      `SELECT id, name, code, category, price_cents, stock_qty, location, photo_url
       FROM products 
       WHERE stock_qty > 0 AND stock_qty <= 5 AND active = true 
       ORDER BY stock_qty ASC, name ASC`
    );

    // 3. Sem localização cadastrada
    const semLocRes = await db.query(
      `SELECT id, name, code, category, price_cents, stock_qty, location, photo_url
       FROM products 
       WHERE (location IS NULL OR TRIM(location) = '' OR location = 'Sem localização') AND active = true 
       ORDER BY name ASC`
    );

    // 4. Divergências pendentes de inventário
    const divergenciasRes = await db.query(
      `SELECT si.*, p.name AS product_name, p.code AS product_code, p.location AS product_location
       FROM stock_inventories si
       JOIN products p ON p.id = si.product_id
       WHERE si.status = 'pendente' AND si.difference != 0
       ORDER BY si.created_at DESC`
    );

    const counts = {
      criticos: criticosRes.rows.length,
      baixos: baixosRes.rows.length,
      semLocalizacao: semLocRes.rows.length,
      divergencias: divergenciasRes.rows.length,
      total: criticosRes.rows.length + baixosRes.rows.length + semLocRes.rows.length + divergenciasRes.rows.length
    };

    res.json({
      counts,
      items: {
        criticos: criticosRes.rows,
        baixos: baixosRes.rows,
        semLocalizacao: semLocRes.rows,
        divergencias: divergenciasRes.rows
      }
    });
  } catch (err) {
    console.error('Erro ao buscar alertas de estoque:', err);
    res.status(500).json({ error: 'Erro ao carregar alertas.' });
  }
});

// -------------------------------------------------------------------
// 4. INVENTÁRIO FÍSICO & AUDITORIA
// -------------------------------------------------------------------
router.get('/inventory', requireRole('admin'), async (_req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        p.id,
        p.name,
        p.code,
        p.category,
        p.stock_qty AS system_stock,
        p.location,
        p.photo_url,
        si.id AS inventory_id,
        si.counted_stock,
        si.difference,
        si.status AS inventory_status,
        si.created_at AS last_counted_at
      FROM products p
      LEFT JOIN LATERAL (
        SELECT * FROM stock_inventories
        WHERE product_id = p.id
        ORDER BY created_at DESC
        LIMIT 1
      ) si ON true
      WHERE p.active = true
      ORDER BY p.name ASC
    `);

    // Estatísticas de inventário
    const totalItens = result.rows.length;
    const auditados = result.rows.filter(r => r.counted_stock !== null && r.counted_stock !== undefined).length;
    const conformes = result.rows.filter(r => r.counted_stock !== null && r.difference === 0).length;
    const divergentes = result.rows.filter(r => r.counted_stock !== null && r.difference !== 0 && r.inventory_status === 'pendente').length;
    const acuracidade = auditados > 0 ? Math.round((conformes / auditados) * 100) : 100;

    res.json({
      products: result.rows,
      stats: {
        totalItens,
        auditados,
        conformes,
        divergentes,
        acuracidade
      }
    });
  } catch (err) {
    console.error('Erro ao carregar inventário:', err);
    res.status(500).json({ error: 'Erro ao carregar dados de inventário.' });
  }
});

router.post('/inventory/count', requireRole('admin'), async (req, res) => {
  try {
    const { productId, countedStock, auditorName } = req.body || {};
    if (!productId || countedStock === undefined || countedStock === null) {
      return res.status(400).json({ error: 'Informe a peça e a contagem física.' });
    }

    const prodRes = await db.query('SELECT id, stock_qty FROM products WHERE id = $1', [productId]);
    if (!prodRes.rows.length) {
      return res.status(404).json({ error: 'Peça não encontrada.' });
    }

    const systemStock = Number(prodRes.rows[0].stock_qty) || 0;
    const countVal = Math.max(0, parseInt(countedStock, 10) || 0);
    const difference = countVal - systemStock;

    const insRes = await db.query(
      `INSERT INTO stock_inventories
        (product_id, system_stock, counted_stock, difference, status, auditor_name)
       VALUES
        ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        productId,
        systemStock,
        countVal,
        difference,
        difference === 0 ? 'conciliado' : 'pendente',
        auditorName || req.user?.name || 'Administrador'
      ]
    );

    res.json({ ok: true, inventory: insRes.rows[0] });
  } catch (err) {
    console.error('Erro ao registrar contagem de inventário:', err);
    res.status(500).json({ error: 'Erro ao salvar contagem.' });
  }
});

router.post('/inventory/reconcile', requireRole('admin'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { productId, countedStock, inventoryId, notes } = req.body || {};
    if (!productId) {
      return res.status(400).json({ error: 'Peça não informada para conciliação.' });
    }

    await client.query('BEGIN');

    const prodRes = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [productId]);
    if (!prodRes.rows.length) {
      throw Object.assign(new Error('Peça não encontrada.'), { status: 404 });
    }
    const product = prodRes.rows[0];
    const prevStock = Number(product.stock_qty) || 0;
    const newStock = Math.max(0, parseInt(countedStock, 10) || 0);
    const diff = newStock - prevStock;

    // Atualiza saldo oficial em products
    await client.query('UPDATE products SET stock_qty = $1, updated_at = now() WHERE id = $2', [newStock, product.id]);

    // Registra movimentação de inventário
    const movRes = await client.query(
      `INSERT INTO stock_movements
        (product_id, type, quantity, previous_stock, new_stock, from_location, to_location, user_name, reference, notes)
       VALUES
        ($1, 'inventario', $2, $3, $4, $5, $5, $6, $7, $8)
       RETURNING *`,
      [
        product.id,
        diff,
        prevStock,
        newStock,
        product.location || 'Sem localização',
        req.user?.name || 'Administrador',
        'Conciliação de Inventário Físico',
        notes || `Ajuste de inventário de ${prevStock} para ${newStock} unidades.`
      ]
    );

    // Marca status conciliado se informado inventoryId ou busca último
    if (inventoryId) {
      await client.query('UPDATE stock_inventories SET status = $1, reconciled_at = now() WHERE id = $2', [
        'conciliado',
        inventoryId
      ]);
    } else {
      await client.query(
        'UPDATE stock_inventories SET status = $1, reconciled_at = now() WHERE product_id = $2 AND status = $3',
        ['conciliado', product.id, 'pendente']
      );
    }

    await client.query('COMMIT');

    res.json({
      ok: true,
      product: { ...product, stock_qty: newStock },
      movement: movRes.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro na conciliação de inventário:', err);
    res.status(err.status || 500).json({ error: err.message || 'Erro ao conciliar inventário.' });
  } finally {
    client.release();
  }
});

module.exports = router;

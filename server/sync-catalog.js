// Sincronização automática do catálogo no banco de dados.
// Garante que o banco (inclusive em produção no Netlify) tenha as colunas
// necessárias e todas as peças oficiais cadastradas.

const db = require('./db');
const { INITIAL_PRODUCTS } = require('./catalog-data');

let syncInProgress = false;
let syncCompleted = false;

async function syncCatalog(force = false) {
  if (syncCompleted && !force) return;
  if (syncInProgress) return;
  syncInProgress = true;

  try {
    // 1. Garante colunas no banco se ainda não existirem
    await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS compatibility TEXT;`);
    await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;`);
    await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT;`);

    // 2. Verifica quantas peças ativas existem no banco
    const countRes = await db.query(`SELECT count(*)::int AS count FROM products WHERE active = true;`);
    const currentCount = (countRes.rows[0] && countRes.rows[0].count) || 0;

    // Se tiver menos de 10 peças ou for forçado, faz o upsert do catálogo oficial
    if (currentCount < 10 || force) {
      console.log(`[SyncCatalog] Sincronizando catálogo oficial (${INITIAL_PRODUCTS.length} peças)...`);
      for (const p of INITIAL_PRODUCTS) {
        await db.query(
          `INSERT INTO products (name, code, category, description, compatibility, price_cents, stock_qty, photo_url, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
           ON CONFLICT (code) DO UPDATE SET
             name = EXCLUDED.name,
             category = EXCLUDED.category,
             description = EXCLUDED.description,
             compatibility = EXCLUDED.compatibility,
             price_cents = EXCLUDED.price_cents,
             stock_qty = EXCLUDED.stock_qty,
             photo_url = EXCLUDED.photo_url,
             active = true;`,
          [p.name, p.code, p.category, p.description, p.compatibility || '', p.price_cents, p.stock_qty, p.photo_url]
        );
      }
      console.log(`[SyncCatalog] Catálogo sincronizado com sucesso.`);
    }
    syncCompleted = true;
  } catch (err) {
    console.error('[SyncCatalog] Erro ao sincronizar catálogo:', err.message);
  } finally {
    syncInProgress = false;
  }
}

module.exports = { syncCatalog };

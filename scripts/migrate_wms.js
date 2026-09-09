// Executa a migração do WMS no Postgres
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../server/db');

async function migrate() {
  console.log('Iniciando migração do WMS no banco Postgres...');
  const schema = fs.readFileSync(path.join(__dirname, '../server/schema.sql'), 'utf8');
  await db.query(schema);
  console.log('Schema verificado/atualizado com sucesso.');

  // Verifica se já existem movimentações
  const countRes = await db.query('SELECT COUNT(*) FROM stock_movements');
  const count = parseInt(countRes.rows[0].count, 10);

  if (count === 0) {
    console.log('Semeando histórico inicial de movimentações para as peças existentes...');
    const prodRes = await db.query('SELECT id, name, code, stock_qty, location FROM products ORDER BY id ASC LIMIT 15');
    const products = prodRes.rows;

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const curStock = Number(p.stock_qty) || 10;
      const loc = p.location || `A-0${(i % 5) + 1}-0${(i % 4) + 1}`;

      // 1. Entrada inicial de estoque (saldo de fábrica / fornecedor)
      await db.query(`
        INSERT INTO stock_movements 
          (product_id, type, quantity, previous_stock, new_stock, to_location, user_name, reference, notes, created_at)
        VALUES 
          ($1, 'entrada', $2, 0, $2, $3, 'Administrador', 'NF 4582 Fornecedor Bosch', 'Entrada inicial de catálogo', now() - interval '3 days')
      `, [p.id, curStock + 5, loc]);

      // 2. Saída por pedido recente
      if (curStock > 5) {
        await db.query(`
          INSERT INTO stock_movements 
            (product_id, type, quantity, previous_stock, new_stock, from_location, to_location, user_name, reference, notes, created_at)
          VALUES 
            ($1, 'saida', -2, $2, $3, $4, $4, 'Carlos Almoxarife', 'Pedido #1024', 'Venda confirmada no balcão', now() - interval '1 day' + interval '2 hours')
        `, [p.id, curStock + 5, curStock + 3, loc]);

        // 3. Ajuste de saldo
        await db.query(`
          INSERT INTO stock_movements 
            (product_id, type, quantity, previous_stock, new_stock, from_location, to_location, user_name, reference, notes, created_at)
          VALUES 
            ($1, 'ajuste', -3, $2, $3, $4, $4, 'João Silveira', 'Conferência de prateleira', 'Ajuste de saldo físico', now() - interval '4 hours')
        `, [p.id, curStock + 3, curStock, loc]);
      }
    }
    console.log('Histórico de movimentações inicial semeado com sucesso!');
  } else {
    console.log(`Já existem ${count} movimentações registradas.`);
  }

  process.exit(0);
}

migrate().catch((err) => {
  console.error('Erro na migração:', err);
  process.exit(1);
});

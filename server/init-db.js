// Script de configuração inicial do banco:
// 1) cria as tabelas (roda schema.sql)
// 2) cria o primeiro usuário admin, se ainda não existir
//
// Uso:
//   ADMIN_EMAIL=voce@fahrenparts.com ADMIN_PASSWORD=umaSenhaForte node server/init-db.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('Criando tabelas (se não existirem)...');
  await db.query(schema);

  const email = (process.env.ADMIN_EMAIL || 'admin@fahrenparts.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'mude-esta-senha';
  const name = process.env.ADMIN_NAME || 'Administrador';

  const existing = await db.query('SELECT id FROM admins WHERE email = $1', [email]);
  if (existing.rows.length) {
    console.log(`Admin ${email} já existe — nada a fazer.`);
  } else {
    const hash = await bcrypt.hash(password, 12);
    await db.query('INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3)', [name, email, hash]);
    console.log(`Admin criado: ${email} / senha: ${password}`);
    console.log('IMPORTANTE: troque essa senha depois de entrar pela primeira vez.');
  }

  await db.pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

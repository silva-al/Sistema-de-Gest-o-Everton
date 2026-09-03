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
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Administrador';

  // Antes, sem ADMIN_PASSWORD o script criava o admin com a senha
  // "mude-esta-senha" — que está escrita neste arquivo, num repositório público.
  // Qualquer pessoa que achasse o site entraria no painel e veria os dados de
  // todos os clientes. Agora o script exige uma senha de verdade.
  if (!password || password.trim().length < 10) {
    console.error(
      'ERRO: defina ADMIN_PASSWORD com pelo menos 10 caracteres antes de rodar este script.\n' +
        'Exemplo:\n' +
        '  ADMIN_EMAIL=voce@fahrenparts.com ADMIN_PASSWORD=suaSenhaForte node server/init-db.js'
    );
    await db.pool.end();
    process.exit(1);
  }

  const existing = await db.query('SELECT id FROM admins WHERE email = $1', [email]);
  if (existing.rows.length) {
    console.log(`Admin ${email} já existe — nada a fazer.`);
  } else {
    const hash = await bcrypt.hash(password, 12);
    await db.query('INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3)', [name, email, hash]);
    // A senha não é impressa: o log do Render fica gravado e pode ser lido depois.
    console.log(`Admin criado: ${email} (use a senha que você definiu em ADMIN_PASSWORD).`);
  }

  await db.pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

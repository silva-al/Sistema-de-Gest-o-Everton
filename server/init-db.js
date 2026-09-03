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
    console.log(`Admin criado com sucesso: ${email} (use a senha definida no ADMIN_PASSWORD).`);
  }

  // Popula catálogo inicial se estiver vazio
  const prodCheck = await db.query('SELECT COUNT(*) AS total FROM products');
  if (parseInt(prodCheck.rows[0].total, 10) === 0) {
    console.log('Catálogo vazio detectado. Cadastrando peças iniciais de demonstração...');
    const initialProducts = [
      {
        name: 'Jogo de Pastilhas de Freio Dianteiras Bosch Cerâmica',
        code: 'BOSCH-0986-BR',
        category: 'Freios',
        description: 'Pastilhas de freio dianteiras de alta durabilidade e frenagem silenciosa. Compatível com linha Gol, Voyage e Fox.',
        price_cents: 14990,
        stock_qty: 15,
        photo_url: '',
      },
      {
        name: 'Par de Discos de Freio Ventilados Dianteiros Fremax',
        code: 'BD-5290-FRE',
        category: 'Freios',
        description: 'Discos ventilados com acabamento anticorrosão e alta resistência térmica.',
        price_cents: 28900,
        stock_qty: 8,
        photo_url: '',
      },
      {
        name: 'Amortecedor Dianteiro Monroe Pressurizado a Gás',
        code: 'MON-SP089',
        category: 'Suspensão',
        description: 'Amortecedor pressurizado a gás OESpectrum, maior estabilidade e conforto em todas as pistas.',
        price_cents: 32000,
        stock_qty: 10,
        photo_url: '',
      },
      {
        name: 'Kit de Correia Dentada e Tensor Gates',
        code: 'GATES-KS104',
        category: 'Motor',
        description: 'Kit de distribuição completo com correia dentada e tensor mecânico.',
        price_cents: 19550,
        stock_qty: 12,
        photo_url: '',
      },
      {
        name: 'Filtro de Óleo Lubrificante Mann-Filter',
        code: 'MANN-W712',
        category: 'Filtros',
        description: 'Filtro de óleo blindado de alta retenção de impurezas para máxima proteção do motor.',
        price_cents: 4890,
        stock_qty: 30,
        photo_url: '',
      },
      {
        name: 'Óleo de Motor Sintético 5W-30 API SP 1 Litro Motul',
        code: 'MOTUL-8100-5W30',
        category: 'Lubrificantes',
        description: 'Lubrificante 100% sintético para motores flex e gasolina. Economia de combustível e proteção.',
        price_cents: 6500,
        stock_qty: 40,
        photo_url: '',
      },
      {
        name: 'Jogo de 4 Velas de Ignição Iridium NGK',
        code: 'NGK-BKR6EIX',
        category: 'Motor',
        description: 'Eletrodo ultrafino de Iridium para faísca mais potente, partida rápida e resposta do acelerador.',
        price_cents: 22000,
        stock_qty: 14,
        photo_url: '',
      },
      {
        name: 'Bomba d Água de Arrefecimento Urba com Junta',
        code: 'URBA-UB0622',
        category: 'Arrefecimento',
        description: 'Bomba d água automotiva fabricada em alumínio com rotor de alta eficiência e vedação de alta durabilidade.',
        price_cents: 17500,
        stock_qty: 6,
        photo_url: '',
      }
    ];

    for (const p of initialProducts) {
      await db.query(
        `INSERT INTO products (name, code, category, description, price_cents, stock_qty, photo_url, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
        [p.name, p.code, p.category, p.description, p.price_cents, p.stock_qty, p.photo_url]
      );
    }
    console.log(`Sucesso: ${initialProducts.length} peças cadastradas no catálogo!`);
  }

  await db.pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

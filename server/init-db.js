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
    // A senha não é impressa: logs de deploy ficam gravados e poderiam expor a credencial.
    console.log(`Admin criado com sucesso: ${email} (use a senha definida no ADMIN_PASSWORD).`);
  }

  // Sincroniza/popula catálogo oficial de peças
  console.log('Sincronizando catálogo de peças oficial...');
  const initialProducts = [
      {
        name: 'Jogo de Pastilhas de Freio Dianteiras Bosch Cerâmica',
        code: 'BOSCH-0986-BR',
        category: 'Freios',
        description: 'Pastilhas de cerâmica de alta durabilidade, frenagem silenciosa e baixo desprendimento de pó. Ideal para uso urbano e rodoviário.',
        compatibility: 'Volkswagen Gol, Voyage, Fox, Polo, Saveiro (2012 em diante)',
        price_cents: 14990,
        stock_qty: 18,
        photo_url: 'images/produtos/pastilha.jpg',
      },
      {
        name: 'Par de Discos de Freio Ventilados Dianteiros Fremax Carbon+',
        code: 'BD-5290-FRE',
        category: 'Freios',
        description: 'Discos com acabamento anti-corrosão Pintura Preta e liga de alto carbono.',
        compatibility: 'Toyota Corolla, Honda Civic, Chevrolet Cruze',
        price_cents: 28900,
        stock_qty: 12,
        photo_url: 'images/categorias/freios.jpg',
      },
      {
        name: 'Fluido de Freio DOT 4 LV Bosch Alta Performance 500ml',
        code: 'DOT4-BOSCH-500',
        category: 'Freios',
        description: 'Fluido de freio sintético de baixa viscosidade para ABS e ESP.',
        compatibility: 'Universal para sistemas hidráulicos DOT 4 / DOT 4 LV',
        price_cents: 4200,
        stock_qty: 25,
        photo_url: 'images/categorias/oleos.jpg',
      },
      {
        name: 'Par de Amortecedores Dianteiros Monroe Pressurizados OESpectrum',
        code: 'MON-SP089-PR',
        category: 'Suspensão',
        description: 'Tecnologia exclusiva Twin Technology com estabilidade e conforto superior.',
        compatibility: 'Chevrolet Onix, Prisma, Spin, Tracker (2013 a 2019)',
        price_cents: 58900,
        stock_qty: 8,
        photo_url: 'images/categorias/suspensao.jpg',
      },
      {
        name: 'Kit Batente, Coifa e Coxim do Amortecedor Dianteiro Axios',
        code: 'AXIOS-BT021',
        category: 'Suspensão',
        description: 'Kit de fixação superior da coluna com rolamento integrado.',
        compatibility: 'Hyundai HB20, HB20S, Creta 1.6',
        price_cents: 8990,
        stock_qty: 20,
        photo_url: 'images/categorias/suspensao.jpg',
      },
      {
        name: 'Par de Bieletas da Barra Estabilizadora Dianteira Nakata',
        code: 'NAK-BL4102',
        category: 'Suspensão',
        description: 'Bieletas reforçadas de articulação esférica selada anti-ruído.',
        compatibility: 'Honda Civic G9/G10, Fit, City',
        price_cents: 11500,
        stock_qty: 15,
        photo_url: 'images/categorias/suspensao.jpg',
      },
      {
        name: 'Jogo de 4 Velas de Ignição Iridium NGK Laser',
        code: 'NGK-ILZKR7B11',
        category: 'Elétrica e ignição',
        description: 'Eletrodo ultrafino de Iridium soldado a laser, partida imediata e economia.',
        compatibility: 'Honda Civic 1.8/2.0, Fit 1.5, HR-V, City i-VTEC Flex',
        price_cents: 22900,
        stock_qty: 16,
        photo_url: 'images/produtos/bobina_2.jpg',
      },
      {
        name: 'Bobina de Ignição Eletrônica Magneti Marelli Individual',
        code: 'MM-BI0048',
        category: 'Elétrica e ignição',
        description: 'Bobina tipo caneta com isolamento térmico de alta densidade.',
        compatibility: 'Volkswagen Gol, Fox, Voyage, Saveiro 1.6 MSI e EA211',
        price_cents: 27950,
        stock_qty: 10,
        photo_url: 'images/produtos/bobina.jpg',
      },
      {
        name: 'Motor de Partida / Arranque Remanufaturado Original Valeo 12V',
        code: 'VAL-MP1201',
        category: 'Elétrica e ignição',
        description: 'Motor de arranque de alto torque e partida suave certificado.',
        compatibility: 'Fiat Palio, Uno, Siena, Strada motores Fire 1.0 e 1.4',
        price_cents: 46000,
        stock_qty: 5,
        photo_url: 'images/categorias/eletrica.jpg',
      },
      {
        name: 'Kit Revisão 4 Filtros (Óleo + Ar + Combustível + Cabine) Mann-Filter',
        code: 'MANN-KIT4-VW',
        category: 'Filtros',
        description: 'Kit completo para revisão periódica com filtros de alta eficiência.',
        compatibility: 'Volkswagen Polo, Virtus, Nivus, T-Cross motores 1.0 200 TSI',
        price_cents: 16890,
        stock_qty: 22,
        photo_url: 'images/produtos/filtro.jpg',
      },
      {
        name: 'Filtro de Ar Condicionado / Cabine com Carvão Ativado Mahle',
        code: 'MAHLE-LAK855',
        category: 'Filtros',
        description: 'Filtro antialérgico com camada tripla de carvão ativado contra odores.',
        compatibility: 'Jeep Renegade, Compass, Fiat Toro, Argo, Cronos',
        price_cents: 5490,
        stock_qty: 35,
        photo_url: 'images/categorias/filtros.jpg',
      },
      {
        name: 'Filtro de Combustível Injeção Eletrônica Blindado Tecfil',
        code: 'TECFIL-GI50/7',
        category: 'Filtros',
        description: 'Corpo blindado em aço inox resistente à corrosão do etanol.',
        compatibility: 'Chevrolet Celta, Corsa, Montana, Agile, Astra Flex',
        price_cents: 3800,
        stock_qty: 40,
        photo_url: 'images/categorias/filtros.jpg',
      },
      {
        name: 'Kit Correia Dentada e Tensor Gates PowerGrip',
        code: 'GATES-KS104',
        category: 'Correias',
        description: 'Kit sincronizador mestre com correia de alta resistência térmica.',
        compatibility: 'Motores GM Família 1 - Onix, Prisma, Cobalt, Spin 1.0, 1.4 e 1.8',
        price_cents: 19550,
        stock_qty: 14,
        photo_url: 'images/categorias/correias.jpg',
      },
      {
        name: 'Correia do Alternador Poly-V Continental Contitech EPDM',
        code: 'CONT-6PK1825',
        category: 'Correias',
        description: 'Correia de acessórios em borracha EPDM anti-ruído de alta tração.',
        compatibility: 'Ford Ka, Fiesta, Ecosport motores 1.5 e 1.6 Sigma',
        price_cents: 7800,
        stock_qty: 25,
        photo_url: 'images/categorias/correias.jpg',
      },
      {
        name: 'Sonda Lambda Sensor de Oxigênio Pré-Catalisador Bosch Planar',
        code: 'BOSCH-025801',
        category: 'Sensores e injeção',
        description: 'Sensor aquecido de 4 fios com cerâmica de resposta rápida.',
        compatibility: 'Volkswagen, Fiat, Chevrolet e Ford motores 1.0 e 1.6 Flex',
        price_cents: 31000,
        stock_qty: 9,
        photo_url: 'images/categorias/sensores.jpg',
      },
      {
        name: 'Sensor de Rotação do Virabrequim Hall Magneti Marelli',
        code: 'MM-SR0109',
        category: 'Sensores e injeção',
        description: 'Sensor magnético de alta precisão para controle da injeção e ignição.',
        compatibility: 'Ford Ka 1.0 3C Ti-VCT, Ecosport, Fiesta Rocam',
        price_cents: 13900,
        stock_qty: 12,
        photo_url: 'images/categorias/sensores.jpg',
      },
      {
        name: 'Óleo de Motor 100% Sintético Motul 8100 X-cess 5W-40 1L',
        code: 'MOTUL-8100-5W40',
        category: 'Óleos e fluidos',
        description: 'Lubrificante sintético premium de alto desempenho e proteção extrema.',
        compatibility: 'VW 502.00, MB 229.5, BMW LL-01, Porsche A40, Renault RN0710',
        price_cents: 6800,
        stock_qty: 50,
        photo_url: 'images/categorias/oleos.jpg',
      },
      {
        name: 'Aditivo de Radiador Concentrado Orgânico Tirreno Long Life 1L',
        code: 'TIRR-LL-ORG1',
        category: 'Óleos e fluidos',
        description: 'Fluido protetor anticorrosivo com tecnologia OAT para sistemas de arrefecimento.',
        compatibility: 'Universal para sistemas de arrefecimento nacionais e importados',
        price_cents: 3690,
        stock_qty: 30,
        photo_url: 'images/categorias/oleos.jpg',
      },
      {
        name: 'Par de Lâmpadas H7 Philips CrystalVision Ultra 4300K Branco Nobre',
        code: 'PHIL-H7-CVU',
        category: 'Iluminação',
        description: 'Efeito xênon elegante de 4300K com vidro de quartzo UV-Block.',
        compatibility: 'Encaixe universal H7 (Farol baixo ou alto)',
        price_cents: 15990,
        stock_qty: 18,
        photo_url: 'images/categorias/iluminacao.jpg',
      },
      {
        name: 'Kit Par de Lâmpadas LED Osram LEDriving H4 6000K Branco Frio',
        code: 'OSRAM-LED-H4',
        category: 'Iluminação',
        description: 'Linha de corte perfeita, dissipador em alumínio aeronáutico e 50% menos consumo.',
        compatibility: 'Encaixe universal H4 Farol Alto/Baixo Integrado (12V)',
        price_cents: 34900,
        stock_qty: 7,
        photo_url: 'images/categorias/iluminacao.jpg',
      }
    ];

    for (const p of initialProducts) {
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
    console.log(`Sucesso: ${initialProducts.length} peças sincronizadas no catálogo!`);

  await db.pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

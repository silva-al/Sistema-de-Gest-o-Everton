// Sobe a loja como servidor de verdade (sua máquina, Render ou VPS).
// No Netlify o ponto de entrada é outro: netlify/functions/api.js.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');
const app = require('./app');

// Sempre que o servidor liga, garante que o banco de dados tem todas as
// tabelas/colunas mais recentes (comandos "CREATE TABLE IF NOT EXISTS" e
// "ADD COLUMN IF NOT EXISTS" — não apaga nem altera dados existentes).
// Assim, novas mudanças de estrutura entram sozinhas a cada deploy.
//
// Isto NÃO roda no Netlify: lá não existe "ligar o servidor", e rodar o schema
// a cada requisição seria lento e perigoso. Ver README, seção Netlify.
async function ensureDatabaseSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(schema);
  console.log('Estrutura do banco de dados verificada/atualizada.');
}

const PORT = process.env.PORT || 3000;
ensureDatabaseSchema()
  .catch((err) => {
    console.error('Falha ao atualizar a estrutura do banco de dados:', err);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Fahren Parts rodando em http://localhost:${PORT}`);
      console.log(`Painel de gestão em http://localhost:${PORT}/admin`);
    });
  });

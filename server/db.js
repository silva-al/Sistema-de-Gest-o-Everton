// Conexão com o banco de dados Postgres (Neon em produção).
require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('ERRO: variável de ambiente DATABASE_URL não definida.');
}

// Configuração do pool de conexão
const isServerless = Boolean(process.env.VERCEL);

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: isServerless ? 1 : 5,
  keepAlive: !isServerless,
});

// Sem este listener, quando o pooler do Neon encerra uma conexão ociosa
// (comportamento normal), o Node derruba o processo inteiro e o site sai do
// ar. Aqui só registramos o erro e deixamos o pool se recuperar sozinho.
pool.on('error', (err) => {
  console.error('Erro inesperado no pool do Postgres (conexão ociosa provavelmente encerrada pelo servidor):', err.message);
});

// Refaz a consulta uma vez se a conexão cair no meio da query — cobre o caso
// de a conexão ser encerrada exatamente durante o uso, não só quando ociosa.
async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    const isConnectionDrop =
      err.code === 'ECONNRESET' ||
      err.code === '57P01' || // admin_shutdown
      /Connection terminated/i.test(err.message || '');

    if (isConnectionDrop) {
      console.warn('Conexão com o banco caiu durante a query, tentando novamente uma vez...');
      return pool.query(text, params);
    }

    throw err;
  }
}

module.exports = {
  query,
  pool,
};

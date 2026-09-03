// Conexão com o banco de dados Postgres (Supabase em produção).
require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('ERRO: variável de ambiente DATABASE_URL não definida. Copie .env.example para .env e preencha.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Provedores em nuvem (Neon, Supabase, Render) exigem SSL com certificado flexível
  ssl: process.env.DATABASE_URL && (
    process.env.DATABASE_URL.includes('neon.tech') ||
    process.env.DATABASE_URL.includes('supabase') ||
    process.env.DATABASE_URL.includes('sslmode=require')
  )
    ? { rejectUnauthorized: false }
    : false,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};

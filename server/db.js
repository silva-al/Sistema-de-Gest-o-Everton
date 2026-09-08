// Conexão com o banco de dados Postgres (Supabase em produção).
require('dotenv').config();
const { Pool } = require('pg');

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_XeVrWqMcj4s9@ep-empty-night-aebwa2bd-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};

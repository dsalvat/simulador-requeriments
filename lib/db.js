import pg from 'pg';
const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}

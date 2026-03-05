import pg from 'pg';
const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    const ssl = process.env.DATABASE_URL?.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : false;
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl,
      max: 5,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}

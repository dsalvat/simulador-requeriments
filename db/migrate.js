#!/usr/bin/env node
/**
 * Migration runner — executes pending SQL migrations from db/ folder.
 *
 * Usage:  node db/migrate.js
 * Env:    DATABASE_URL must be set
 *
 * How it works:
 * 1. Creates a `schema_migrations` table if it doesn't exist
 * 2. Reads all db/migrate_*.sql files sorted alphabetically
 * 3. Skips already-applied migrations
 * 4. Runs pending ones inside a transaction
 */

import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env if running locally (same approach as server.js)
try {
  const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf8');
  envFile.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  });
} catch {}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  try {
    // Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get already-applied migrations
    const { rows: applied } = await client.query('SELECT name FROM schema_migrations ORDER BY name');
    const appliedSet = new Set(applied.map(r => r.name));

    // Find migration files
    const files = readdirSync(__dirname)
      .filter(f => f.startsWith('migrate_') && f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }

    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  ✓ ${file} (already applied)`);
        continue;
      }

      const sql = readFileSync(join(__dirname, file), 'utf8');
      console.log(`  ▶ Applying ${file}...`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  ✓ ${file} applied`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ ${file} FAILED:`, err.message);
        process.exit(1);
      }
    }

    console.log(`\n${count > 0 ? `✅ ${count} migration(s) applied` : '✅ Database is up to date'}`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});

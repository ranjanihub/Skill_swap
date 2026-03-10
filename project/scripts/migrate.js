#!/usr/bin/env node
/**
 * Migration runner - applies all pending SQL migrations to the Supabase database.
 *
 * Usage:
 *   node scripts/migrate.js
 *
 * Requires DATABASE_URL in your .env file.
 * Get it from: Supabase Dashboard → Project Settings → Database → Connection string → URI
 * It looks like: postgresql://postgres:[YOUR-PASSWORD]@db.ofqsoyuipclgtvwcizwx.supabase.co:5432/postgres
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load .env manually (no dotenv dependency needed)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length && !process.env[key.trim()]) {
      process.env[key.trim()] = rest.join('=').trim();
    }
  });
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL is not set in .env');
  console.error('');
  console.error('   1. Go to: https://supabase.com/dashboard/project/ofqsoyuipclgtvwcizwx/settings/database');
  console.error('   2. Scroll to "Connection string" → select "URI" tab');
  console.error('   3. Copy the string (replace [YOUR-PASSWORD] with your DB password)');
  console.error('   4. Add to .env:  DATABASE_URL=postgresql://postgres:[password]@db.ofqsoyuipclgtvwcizwx.supabase.co:5432/postgres');
  console.error('   5. Re-run:  node scripts/migrate.js');
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

async function run() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('✅  Connected to database\n');

  // Ensure migrations tracking table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id serial PRIMARY KEY,
      filename text UNIQUE NOT NULL,
      applied_at timestamptz DEFAULT now()
    );
  `);

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows: applied } = await client.query('SELECT filename FROM _migrations');
  const appliedSet = new Set(applied.map((r) => r.filename));

  let ran = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  ⏭  ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`  ▶  Applying ${file} ...`);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  ✅  ${file} applied`);
      ran++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ❌  ${file} FAILED: ${err.message}`);
      // Don't abort — continue with remaining migrations
    }
  }

  await client.end();
  console.log(`\n${ran} migration(s) applied.`);
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});

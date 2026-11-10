/**
 * Apply the SQL migrations in ./drizzle then optionally seed.
 *
 *   npx tsx scripts/migrate.ts          # migrate only
 *   npx tsx scripts/migrate.ts --seed   # migrate + seed demo data
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { loadEnv } from './load-env';

loadEnv();

const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: /sslmode=require/i.test(process.env.DATABASE_URL ?? '')
      ? { rejectUnauthorized: false }
      : undefined,
  });
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS _vaultly_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set<string>(
    (await client.query<{ name: string }>('SELECT name FROM _vaultly_migrations')).rows.map(
      (r) => r.name,
    ),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[migrate] skip ${file}`);
      continue;
    }
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`[migrate] applying ${file}`);
    await client.query('BEGIN');
    try {
      // drizzle uses --> statement-breakpoint between statements; pg can run the
      // whole file as one multi-statement query inside a transaction.
      await client.query(sql.replaceAll('--> statement-breakpoint', ''));
      await client.query('INSERT INTO _vaultly_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }

  await client.end();
  console.log('[migrate] done');

  if (process.argv.includes('--seed')) {
    const { runSeed } = await import('../prisma/seed');
    await runSeed();
  }
}

main().catch((err) => {
  console.error('[migrate] failed', err);
  process.exit(1);
});

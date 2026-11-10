/**
 * Local development database.
 *
 * Starts an embedded PostgreSQL instance (downloaded on first run) that matches
 * whatever DATABASE_URL points to. Intended for `npm run db:local` only —
 * production deployments should point DATABASE_URL at a managed Postgres.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnv } from './load-env';

loadEnv();

const databaseDir = process.env.LOCAL_PG_DIR ?? path.join(process.cwd(), '.data', 'postgres');
const port = Number(process.env.LOCAL_PG_PORT ?? 5432);
const user = process.env.LOCAL_PG_USER ?? 'postgres';
const password = process.env.LOCAL_PG_PASSWORD ?? 'postgres';
const database = process.env.LOCAL_PG_DATABASE ?? 'vaultly';

const alreadyInitialised = existsSync(path.join(databaseDir, 'PG_VERSION'));

const pg = new EmbeddedPostgres({
  databaseDir,
  user,
  password,
  port,
  persistent: true,
});

async function main() {
  if (!alreadyInitialised) {
    console.log(`[db] initialising embedded postgres at ${databaseDir}`);
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase(database);
    console.log(`[db] created database "${database}"`);
  } catch {
    // already exists
  }
  console.log(`[db] postgres ready on port ${port} (db: ${database})`);

  const shutdown = async () => {
    console.log('\n[db] shutting down');
    await pg.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[db] failed', err);
  process.exit(1);
});

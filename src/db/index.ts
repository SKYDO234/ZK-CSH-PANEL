import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/**
 * Single pooled connection shared across the Node process (Next.js route
 * handlers + server components). Hot reload in dev creates fresh module scopes,
 * so the pool is cached on globalThis to avoid leaking connections.
 */
declare global {
  // eslint-disable-next-line no-var
  var __vaultlyPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __vaultlyDb: NodePgDatabase<typeof schema> | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and configure it.');
  }
  const needsSsl =
    /sslmode=require/i.test(connectionString) ||
    (process.env.DATABASE_SSL === 'true' && !/localhost|127\.0\.0\.1/.test(connectionString));

  const pool = new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
  pool.on('error', (err) => console.error('[db] idle client error', err.message));
  return pool;
}

export const pool: Pool = globalThis.__vaultlyPool ?? createPool();
if (process.env.NODE_ENV !== 'production') globalThis.__vaultlyPool = pool;

export const db: NodePgDatabase<typeof schema> = globalThis.__vaultlyDb ?? drizzle(pool, { schema });
if (process.env.NODE_ENV !== 'production') globalThis.__vaultlyDb = db;

export * from './schema';

/**
 * Database reachability probe.
 *
 *   npx tsx scripts/db-ping.ts        # exit 0 when the database answers
 *
 * Loads .env the same way the app does, so it can be used from installers,
 * container health checks and CI without duplicating env parsing.
 */
import { Client } from 'pg';
import { loadEnv } from './load-env';

loadEnv();
loadEnv('.env.local');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}

async function main() {
  const connectionString: string = url as string;
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 3000,
    ssl: /sslmode=require/i.test(connectionString) ? { rejectUnauthorized: false } : undefined,
  });
  try {
    await client.connect();
    await client.query('select 1');
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}

void main();

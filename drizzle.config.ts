import { defineConfig } from 'drizzle-kit';
import { loadEnv } from './scripts/load-env';

loadEnv();

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/vaultly?schema=public',
  },
  verbose: true,
  strict: false,
});

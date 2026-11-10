/**
 * One-command setup: migrate the database, seed roles/settings and create the
 * first Super Admin from ADMIN_EMAIL / ADMIN_PASSWORD.
 *
 *   npm run setup
 *   npm run setup -- --demo   # include demo users and folders
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadEnv } from './load-env';

loadEnv();

const demo = process.argv.includes('--demo');

function run(args: string[], label: string) {
  console.log(`\n▶ ${label}`);
  execFileSync('npx', args, { stdio: 'inherit', env: process.env });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
    process.exit(1);
  }
  if (!existsSync('.env') && !existsSync('.env.local')) {
    console.warn('! No .env file found — using process environment only.');
  }

  run(['tsx', 'scripts/migrate.ts'], 'Applying database migrations');
  run(['tsx', 'prisma/seed.ts', ...(demo ? ['--demo'] : [])], 'Seeding roles, settings and admin user');

  console.log('\n✅ Setup complete');
  console.log(`   Sign in at ${process.env.APP_URL ?? 'http://localhost:3000'}/login`);
  console.log(`   Email:    ${process.env.ADMIN_EMAIL ?? 'admin@example.com'}`);
  console.log('   Password: (the ADMIN_PASSWORD you configured)');
  console.log('\n   Start the app with:  npm run dev');
}

main().catch((err) => {
  console.error('\n✖ Setup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

#!/usr/bin/env bash
# Starts a local Postgres (embedded, no Docker needed) and the Next.js dev
# server together. Ctrl-C stops both.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  echo "→ created .env from .env.example"
fi

echo "→ starting local postgres…"
npx tsx scripts/local-db.ts &
DB_PID=$!

cleanup() {
  echo
  echo "→ shutting down"
  kill "$DB_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# Wait for the database to accept connections
for i in $(seq 1 40); do
  if node -e "
    const {Client}=require('pg');
    const c=new Client({connectionString:process.env.DATABASE_URL});
    c.connect().then(()=>c.end()).then(()=>process.exit(0)).catch(()=>process.exit(1));
  " 2>/dev/null; then
    break
  fi
  sleep 1
done

echo "→ applying migrations"
npx tsx scripts/migrate.ts

echo "→ starting dev server"
npx next dev -H 0.0.0.0 -p "${PORT:-3000}"

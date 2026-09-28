#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEED="${ROOT}/supabase/seed_30_products.sql"

if [[ -z "${DATABASE_URL:-}" ]]; then
  cat >&2 <<'EOF'
DATABASE_URL is required.
Copy the direct/session-pooler Postgres connection string from:
Supabase Dashboard -> Project Settings -> Database -> Connection string.
Then run:
  DATABASE_URL='postgresql://...' npm run db:seed:catalog
EOF
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required. Install the PostgreSQL client, or paste ${SEED} into Supabase SQL Editor." >&2
  exit 1
fi

psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${SEED}"
echo "Catalog seed completed. Confirm /api/health reports activeProducts >= 30."

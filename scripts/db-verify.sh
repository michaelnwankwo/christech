#!/usr/bin/env bash
# ============================================================================
# End-to-end SQL verification against a real PostgreSQL instance.
# Applies every migration on a fresh database (with a Supabase-compatible
# role/auth stub) and then runs the §19 assertion battery.
# Any failure exits non-zero.
# ============================================================================
set -euo pipefail

DB="${VERIFY_DB:-chrisviscus_verify}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -q)

echo "==> Recreating ${DB}"
"${PSQL[@]}" -c "drop database if exists ${DB} with (force);"
"${PSQL[@]}" -c "create database ${DB};"
PSQL+=(-d "$DB")

echo "==> Harness setup (roles, auth stub, grants, assert helpers)"
"${PSQL[@]}" < "${ROOT}/scripts/sql/000_setup.sql"

for f in "${ROOT}"/supabase/migrations/0*.sql; do
  echo "==> Applying $(basename "$f")"
  "${PSQL[@]}" < "$f"
done

echo "==> Running assertion battery"
"${PSQL[@]}" < "${ROOT}/scripts/sql/100_assert.sql"

echo "DB VERIFY: PASS"

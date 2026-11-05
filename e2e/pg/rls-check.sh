#!/usr/bin/env bash
# Loads every migration into a scratch database on a REAL Postgres and checks the row-level-security rules:
#   1. no table has policies that point at each other ("infinite recursion")
#   2. every table can be read as anon / household / cleaner / business / admin without an error
#   3. the business sign-up path (profile + unit insert returning the row) works for a business user
# Usage: PGHOST=<socket dir or host> PGPORT=5544 PGUSER=pgtest ./e2e/pg/rls-check.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../.."
DB=alieni_rls_check
ERR="$(mktemp)"
psql -q postgres -c "drop database if exists $DB" -c "create database $DB"
P="psql -q -v ON_ERROR_STOP=1 $DB"
$P -f "$HERE/shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  # postgis extension, geography(point, 4326) typmod and gist indexes on it are not available on a plain Postgres
  sed -E 's/^create extension if not exists postgis;//; s/geography\(point, ?4326\)/geography/g; /using gist/d' "$f" | $P >/dev/null 2>"$ERR" || { echo "MIGRATION FAILED: $(basename "$f")"; cat "$ERR"; exit 2; }
done
echo "migrations: all $(ls "$ROOT"/supabase/migrations/*.sql | wc -l) loaded"
psql -q -v ON_ERROR_STOP=1 -t -A $DB -f "$HERE/rls-probe.sql"

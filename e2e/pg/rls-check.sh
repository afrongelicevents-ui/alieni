#!/usr/bin/env bash
# Loads every migration into a scratch database on a REAL Postgres and checks the row-level-security rules:
#   1. no table has policies that point at each other ("infinite recursion")
#   2. every table can be read as anon / household / cleaner / business / admin without an error
#   3. the business sign-up path (profile + unit insert returning the row) works for a business user
# UPGRADE=1 mimics the live database: migrations up to 0023 are loaded, real data is created, then Part 14 (0024)
# is applied on top of that data and every check runs afterwards.
# Usage: PGHOST=<socket dir or host> PGPORT=5544 PGUSER=pgtest ./e2e/pg/rls-check.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../.."
DB=alieni_rls_check
ERR="$(mktemp)"
psql -q postgres -c "drop database if exists $DB" -c "create database $DB"
P="psql -q -v ON_ERROR_STOP=1 $DB"
$P -f "$HERE/shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  if [ "${UPGRADE:-0}" = "1" ] && [[ "$(basename "$f")" == 0024_* ]]; then continue; fi
  # postgis extension, geography(point, 4326) typmod and gist indexes on it are not available on a plain Postgres
  sed -E 's/^create extension if not exists postgis;//; s/geography\(point, ?4326\)/geography/g; /using gist/d' "$f" | $P >/dev/null 2>"$ERR" || { echo "MIGRATION FAILED: $(basename "$f")"; cat "$ERR"; exit 2; }
done
echo "migrations loaded"
if [ "${UPGRADE:-0}" = "1" ]; then echo "mode: UPGRADE (0001-0023, data, then 0024 on top)"; EXTRA="-v apply_part14=1"; else echo "mode: fresh (all migrations)"; EXTRA=""; fi
cd "$HERE" && psql -q -v ON_ERROR_STOP=1 $EXTRA -t -A $DB -f rls-probe.sql

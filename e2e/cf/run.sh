#!/bin/bash
# End-to-end tests against the REAL Worker running locally (wrangler dev = workerd + local D1 + local R2).
#   bash e2e/cf/run.sh            # fresh database + seed, build, serve on :8787, run every flow
#   SKIP_BUILD=1 bash e2e/cf/run.sh flow-guest flow-household   # reuse the last build, run some flows
set -u
cd "$(dirname "$0")/../.."
OUT=${E2E_OUT:-e2e/out}; mkdir -p "$OUT"
PORT=${PORT:-8787}
FLOWS=${*:-flow-guest flow-auth flow-household flow-cleaner flow-business flow-admin flow-account flow-security}

fuser -k "$PORT/tcp" >/dev/null 2>&1; sleep 1
rm -rf .wrangler/state/v3/d1 .wrangler/state/v3/r2
printf 'BETTER_AUTH_SECRET=%s\nBETTER_AUTH_URL=http://localhost:%s\nCRON_SECRET=e2e-cron-secret\n' "$(openssl rand -hex 32)" "$PORT" > .dev.vars
npx wrangler d1 migrations apply alieni --local >/dev/null 2>&1 || { echo "migrations failed"; exit 1; }
node scripts/seed.mjs --out "$OUT/seed.sql" 2>/dev/null && npx wrangler d1 execute alieni --local --file "$OUT/seed.sql" >/dev/null 2>&1 || { echo "seed failed"; exit 1; }
if [ -z "${SKIP_BUILD:-}" ]; then npx opennextjs-cloudflare build > "$OUT/build.log" 2>&1 || { echo "build failed (see $OUT/build.log)"; tail -30 "$OUT/build.log"; exit 1; }; fi
(npx wrangler dev --port "$PORT" --ip 127.0.0.1 > "$OUT/wrangler.log" 2>&1 &)
for i in $(seq 1 90); do curl -s -o /dev/null "http://127.0.0.1:$PORT/api/me" && break; sleep 1; done

fail=0
for f in $FLOWS; do
  r=$(APP="http://127.0.0.1:$PORT" timeout 900 node "e2e/cf/$f.cjs" 2>&1)
  echo "== $f: $(echo "$r" | grep -E 'passed$' | tail -1)"
  echo "$r" | grep -E "^FAIL|Error|Timeout" | head -15 | cut -c1-300
  echo "$r" | grep -qE "^FAIL|Error:" && fail=1
done
[ -n "${KEEP_SERVER:-}" ] || fuser -k "$PORT/tcp" >/dev/null 2>&1
exit $fail

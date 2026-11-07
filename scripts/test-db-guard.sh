#!/usr/bin/env bash
# Safety check for the "Set up TEST database" workflow. Refuses anything that could be the live project.
# Usage: LIVE_REFS="ref1 ref2" scripts/test-db-guard.sh <project-ref> <project-name | --ref-only>
# --ref-only checks only the reference (format and live project), before anything is asked from Supabase.
set -euo pipefail
ref="${1:-}"; name="${2:-}"
ref="$(printf '%s' "$ref" | tr 'A-Z' 'a-z' | tr -d '[:space:]')"
if ! [[ "$ref" =~ ^[a-z]{20}$ ]]; then
  echo "REFUSED: TEST_SUPABASE_PROJECT_REF is not a project reference (20 lower-case letters, from Project settings → General)."; exit 1
fi
for live in ${LIVE_REFS:-}; do
  live="$(printf '%s' "$live" | tr 'A-Z' 'a-z')"
  if [ -n "$live" ] && [ "$ref" = "$live" ]; then
    echo "REFUSED: this is the LIVE project. Nothing was changed."; exit 1
  fi
done
if [ "$name" = "--ref-only" ]; then exit 0; fi
if ! printf '%s' "$name" | grep -qi 'test'; then
  echo "REFUSED: the project's name does not contain the word 'test'. Rename the test project (for example alieni-test) or check TEST_SUPABASE_PROJECT_REF. Nothing was changed."; exit 1
fi
echo "OK: target project is '$name' (not a known live project)."

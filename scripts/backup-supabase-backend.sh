#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="dslccwkaitihiszetdlh"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v npx >/dev/null 2>&1; then
  echo "ERROR: Node.js/npm is required."
  exit 1
fi

SUPABASE=(npx supabase)

printf '\n== GRIOT Supabase backend backup ==\n'
printf 'Project: %s\n\n' "$PROJECT_REF"

"${SUPABASE[@]}" --version
"${SUPABASE[@]}" login
"${SUPABASE[@]}" link --project-ref "$PROJECT_REF"

mkdir -p supabase/functions

printf '\n-- Pulling database schema into migrations --\n'
"${SUPABASE[@]}" db pull --linked

printf '\n-- Pulling custom Auth schema changes --\n'
"${SUPABASE[@]}" db pull --schema auth --linked -f pull_auth_schema || true

printf '\n-- Pulling custom Storage schema changes --\n'
"${SUPABASE[@]}" db pull --schema storage --linked -f pull_storage_schema || true

printf '\n-- Downloading all deployed Edge Functions --\n'
functions=(
  griot-api
  griot-opb
  griot-fabric
  griot-gcu
  griot-orchestrator
  griot-auth-magic
  griot-studio
  griot-studio-compute
  griot-admin-api
  griot-gpu
)

for fn in "${functions[@]}"; do
  echo "Downloading $fn"
  "${SUPABASE[@]}" functions download "$fn"
done

printf '\n-- Generating database TypeScript types --\n'
"${SUPABASE[@]}" gen types typescript --linked > supabase/database.types.ts

printf '\n== Backup capture complete ==\n'
printf '%s\n' \
  'Review every generated migration before committing.' \
  'DO NOT commit production data, Supabase credentials, provider API keys, OAuth secrets, vault keys, or .env files.' \
  'For a separate local-only production data dump, use:' \
  '  npx supabase db dump --linked --data-only > supabase/.prod-data.sql'
printf '\nCheck the result with: git status --short\n'

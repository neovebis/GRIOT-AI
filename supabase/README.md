# GRIOT Supabase Backend

This directory is the version-controlled home for the GRIOT Supabase backend.

## Live project

- Supabase project: `griot`
- Project ref: `dslccwkaitihiszetdlh`
- Region: `eu-central-1`
- Runtime: PostgreSQL 17

## What belongs here

- `migrations/` — database schema and migration history
- `functions/` — deployed Edge Function source
- `database.types.ts` — generated TypeScript database types
- `config.toml` — non-secret CLI configuration
- `seed.sql` — development/test seed data only

## What must never be committed

- `.env` / `.env.*`
- Supabase secret/service-role credentials
- provider API keys
- OAuth client secrets
- `GRIOT_VAULT_MASTER_KEY`
- Cloudflare R2 access keys
- production user data
- production credentials or credential ciphertext

## Rebuild workflow

From the repository root:

```bash
bash scripts/backup-supabase-backend.sh
```

The script links the local CLI to the live project, pulls the database schema into migrations, downloads all current Edge Functions, and generates TypeScript database types.

Review generated migrations before committing. Supabase's managed `auth` and `storage` schemas are handled separately because they are platform-managed.

Production data is deliberately not placed in Git. When a local-only data backup is required, write it under `.supabase-backups/` and keep that directory ignored.

## Important

The GitHub repository is public. Treat every committed file as public. The frontend publishable key may be public by design, but credentials and server-side secrets are not.

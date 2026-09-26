# SHEOL + Supabase v0.3

## Environments

Staging: Griot test (oxulnwbwpfxwjbvxlrga)

Production: griot (dslccwkaitihiszetdlh)

## Schema

The SHEOL private schema contains nine tables: missions, plans, phases, attempts, artifacts, gates, capsules, replans and events.

Logical SHEOL execution identifiers are stored as text. owner_user_id remains UUID-backed through Supabase Auth.

All SHEOL tables have RLS enabled and the schema is private; it is not intended for client Data API exposure.

## Safety boundary

SHEOL persistence is server-side. No service-role credential belongs in GRIOT Mobile.

## Execution boundary

The mobile sandbox executes work locally. Supabase records durable control-plane state and evidence.

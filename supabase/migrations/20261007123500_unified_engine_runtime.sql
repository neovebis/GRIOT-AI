-- Unified GRIOT engine/runtime contract.
-- Keeps engine selection distinct from provider/model selection and adds an audited
-- Studio Compute native-device job transport. No provider/gateway secrets are exposed.

alter table public.griot_conversations
  add column if not exists engine_id text not null default 'orchestrator';

alter table public.griot_conversations
  drop constraint if exists griot_conversations_engine_id_check;
alter table public.griot_conversations
  add constraint griot_conversations_engine_id_check
  check (engine_id = any (array['orchestrator'::text, 'sheol'::text]));

alter table public.griot_studio_tasks
  add column if not exists engine_id text not null default 'orchestrator';

alter table public.griot_studio_tasks
  drop constraint if exists griot_studio_tasks_engine_id_check;
alter table public.griot_studio_tasks
  add constraint griot_studio_tasks_engine_id_check
  check (engine_id = any (array['orchestrator'::text, 'sheol'::text]));

alter table public.griot_studio_compute_connections
  drop constraint if exists griot_studio_compute_connections_provider_check;
alter table public.griot_studio_compute_connections
  add constraint griot_studio_compute_connections_provider_check
  check (provider = any (array['google_cloud_shell'::text, 'cloudflare_sandbox'::text, 'native'::text]));

alter table public.griot_studio_runtimes
  drop constraint if exists griot_studio_runtimes_provider_check;
alter table public.griot_studio_runtimes
  add constraint griot_studio_runtimes_provider_check
  check (provider = any (array['google_cloud_shell'::text, 'cloudflare_sandbox'::text, 'native'::text]));

alter table public.griot_studio_compute_runs
  drop constraint if exists griot_studio_compute_runs_provider_check;
alter table public.griot_studio_compute_runs
  add constraint griot_studio_compute_runs_provider_check
  check (provider = any (array['google_cloud_shell'::text, 'cloudflare_sandbox'::text, 'native'::text]));

create table if not exists public.griot_studio_native_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.griot_workspaces(id) on delete cascade,
  project_id uuid not null references public.griot_studio_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null,
  tool text not null
    check (tool = any (array[
      'workspace.list'::text,
      'workspace.read'::text,
      'workspace.write'::text,
      'workspace.delete'::text,
      'workspace.rename'::text,
      'archive.extract'::text,
      'command.execute'::text,
      'test.run'::text,
      'build.run'::text
    ])),
  input jsonb not null default '{}'::jsonb
    check (jsonb_typeof(input) = 'object'),
  state text not null default 'queued'
    check (state = any (array[
      'queued'::text,
      'claimed'::text,
      'completed'::text,
      'failed'::text,
      'approval_required'::text,
      'cancelled'::text
    ])),
  result jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result) = 'object'),
  result_sha256 text,
  exit_code integer,
  approval_required boolean not null default false,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint griot_studio_native_jobs_result_sha256_check
    check (result_sha256 is null or result_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists griot_studio_native_jobs_claim_idx
  on public.griot_studio_native_jobs (user_id, project_id, state, created_at);

create index if not exists griot_studio_native_jobs_run_idx
  on public.griot_studio_native_jobs (workspace_id, project_id, run_id, created_at);

alter table public.griot_studio_native_jobs enable row level security;

-- Native jobs are intentionally not exposed through the Data API to end users.
-- The authenticated device worker goes through griot-studio-compute, which performs
-- auth/workspace/project authorization before service-role reads/writes.
revoke all on table public.griot_studio_native_jobs from anon, authenticated;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to service_role;

create table if not exists private.sheol_missions (
  mission_id text primary key,
  owner_user_id uuid null references auth.users(id) on delete set null,
  state text not null check (state in ('CREATED','PLANNED','READY','RUNNING','VERIFYING','REWORK','REPLANNING','COMMITTED','COMPLETED','FAILED','CANCELLED')),
  constitution_hash text not null,
  constitution jsonb not null,
  active_plan_version integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.sheol_plans (
  mission_id text not null references private.sheol_missions(mission_id) on delete cascade,
  plan_version integer not null check (plan_version > 0),
  plan jsonb not null,
  created_at timestamptz not null default now(),
  primary key (mission_id, plan_version)
);

create table if not exists private.sheol_phases (
  phase_id text primary key,
  mission_id text not null references private.sheol_missions(mission_id) on delete cascade,
  plan_version integer not null,
  phase_key text not null,
  order_index integer not null check (order_index >= 0),
  state text not null check (state in ('LOCKED','READY','RUNNING','VERIFYING','REWORK','COMMITTED','FAILED')),
  contract jsonb not null,
  active_attempt_id text null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mission_id, plan_version, phase_key)
);

create table if not exists private.sheol_attempts (
  attempt_id text primary key,
  mission_id text not null references private.sheol_missions(mission_id) on delete cascade,
  phase_id text not null references private.sheol_phases(phase_id) on delete cascade,
  attempt_no integer not null check (attempt_no > 0),
  state text not null check (state in ('RUNNING','VERIFYING','PASS','FAIL','UNCERTAIN','ABORTED')),
  model_id text null,
  request jsonb null,
  result jsonb null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  committed_at timestamptz null,
  unique (phase_id, attempt_no)
);

create table if not exists private.sheol_artifacts (
  artifact_id text primary key,
  mission_id text not null references private.sheol_missions(mission_id) on delete cascade,
  phase_id text not null references private.sheol_phases(phase_id) on delete cascade,
  attempt_id text not null references private.sheol_attempts(attempt_id) on delete cascade,
  path text not null,
  version integer not null check (version > 0),
  content_sha256 text not null,
  content_text text null,
  storage_uri text null,
  metadata jsonb not null default '{}'::jsonb,
  committed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (mission_id, path, version)
);

create table if not exists private.sheol_gates (
  gate_result_id text primary key,
  mission_id text not null references private.sheol_missions(mission_id) on delete cascade,
  phase_id text not null references private.sheol_phases(phase_id) on delete cascade,
  attempt_id text not null references private.sheol_attempts(attempt_id) on delete cascade,
  gate_id text not null,
  status text not null check (status in ('PASS','FAIL','UNCERTAIN')),
  reasons jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists private.sheol_capsules (
  capsule_id text primary key,
  mission_id text not null references private.sheol_missions(mission_id) on delete cascade,
  phase_id text not null references private.sheol_phases(phase_id) on delete cascade,
  capsule jsonb not null,
  created_at timestamptz not null default now(),
  unique (phase_id)
);

create table if not exists private.sheol_replans (
  replan_id text primary key,
  mission_id text not null references private.sheol_missions(mission_id) on delete cascade,
  from_plan_version integer not null,
  to_plan_version integer not null,
  reason text not null,
  evidence jsonb not null default '[]'::jsonb,
  proposed_plan jsonb not null,
  accepted boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists private.sheol_events (
  sequence_no bigint generated always as identity primary key,
  event_id text not null unique,
  mission_id text not null references private.sheol_missions(mission_id) on delete cascade,
  phase_id text null references private.sheol_phases(phase_id) on delete set null,
  attempt_id text null references private.sheol_attempts(attempt_id) on delete set null,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists sheol_missions_owner_user_idx on private.sheol_missions(owner_user_id);
create index if not exists sheol_attempts_mission_idx on private.sheol_attempts(mission_id);
create index if not exists sheol_attempts_phase_idx on private.sheol_attempts(phase_id);
create index if not exists sheol_artifacts_mission_idx on private.sheol_artifacts(mission_id, committed);
create index if not exists sheol_artifacts_phase_idx on private.sheol_artifacts(phase_id, committed);
create index if not exists sheol_artifacts_attempt_idx on private.sheol_artifacts(attempt_id);
create index if not exists sheol_gates_mission_idx on private.sheol_gates(mission_id);
create index if not exists sheol_gates_phase_idx on private.sheol_gates(phase_id, created_at desc);
create index if not exists sheol_gates_attempt_idx on private.sheol_gates(attempt_id);
create index if not exists sheol_capsules_mission_idx on private.sheol_capsules(mission_id);
create index if not exists sheol_replans_mission_idx on private.sheol_replans(mission_id);
create index if not exists sheol_events_mission_idx on private.sheol_events(mission_id, sequence_no);
create index if not exists sheol_events_phase_idx on private.sheol_events(phase_id, sequence_no);
create index if not exists sheol_events_attempt_idx on private.sheol_events(attempt_id);

alter table private.sheol_missions enable row level security;
alter table private.sheol_plans enable row level security;
alter table private.sheol_phases enable row level security;
alter table private.sheol_attempts enable row level security;
alter table private.sheol_artifacts enable row level security;
alter table private.sheol_gates enable row level security;
alter table private.sheol_capsules enable row level security;
alter table private.sheol_replans enable row level security;
alter table private.sheol_events enable row level security;

grant select, insert, update, delete on all tables in schema private to service_role;
grant usage, select on all sequences in schema private to service_role;

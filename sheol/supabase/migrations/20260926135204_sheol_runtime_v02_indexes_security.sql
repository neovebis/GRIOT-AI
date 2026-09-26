set search_path = pg_catalog;

create index if not exists sheol_missions_owner_user_idx on private.sheol_missions(owner_user_id);
create index if not exists sheol_attempts_mission_idx on private.sheol_attempts(mission_id);
create index if not exists sheol_attempts_phase_idx on private.sheol_attempts(phase_id);
create index if not exists sheol_artifacts_attempt_idx on private.sheol_artifacts(attempt_id);
create index if not exists sheol_gates_mission_idx on private.sheol_gates(mission_id);
create index if not exists sheol_gates_attempt_idx on private.sheol_gates(attempt_id);
create index if not exists sheol_capsules_mission_idx on private.sheol_capsules(mission_id);
create index if not exists sheol_replans_mission_idx on private.sheol_replans(mission_id);

create or replace function private.sheol_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists sheol_missions_touch_updated_at on private.sheol_missions;
create trigger sheol_missions_touch_updated_at before update on private.sheol_missions for each row execute function private.sheol_touch_updated_at();
drop trigger if exists sheol_phases_touch_updated_at on private.sheol_phases;
create trigger sheol_phases_touch_updated_at before update on private.sheol_phases for each row execute function private.sheol_touch_updated_at();

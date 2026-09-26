alter table private.sheol_missions alter column mission_id type text using mission_id::text;
alter table private.sheol_plans alter column mission_id type text using mission_id::text;
alter table private.sheol_phases alter column phase_id type text using phase_id::text, alter column mission_id type text using mission_id::text;
alter table private.sheol_attempts alter column attempt_id type text using attempt_id::text, alter column mission_id type text using mission_id::text, alter column phase_id type text using phase_id::text;
alter table private.sheol_artifacts alter column artifact_id type text using artifact_id::text, alter column mission_id type text using mission_id::text, alter column phase_id type text using phase_id::text, alter column attempt_id type text using attempt_id::text;
alter table private.sheol_gates alter column gate_result_id type text using gate_result_id::text, alter column mission_id type text using mission_id::text, alter column phase_id type text using phase_id::text, alter column attempt_id type text using attempt_id::text;
alter table private.sheol_capsules alter column capsule_id type text using capsule_id::text, alter column mission_id type text using mission_id::text, alter column phase_id type text using phase_id::text;
alter table private.sheol_replans alter column replan_id type text using replan_id::text, alter column mission_id type text using mission_id::text;
alter table private.sheol_events alter column event_id type text using event_id::text, alter column mission_id type text using mission_id::text, alter column phase_id type text using phase_id::text, alter column attempt_id type text using attempt_id::text;

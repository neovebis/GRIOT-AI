-- Align phase active attempt identifier with logical SHEOL attempt IDs.
alter table private.sheol_phases alter column active_attempt_id type text using active_attempt_id::text;

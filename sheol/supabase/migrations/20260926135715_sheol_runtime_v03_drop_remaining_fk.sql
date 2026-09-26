-- Production parity migration: the initial drop migration omitted this FK.
alter table private.sheol_capsules drop constraint if exists sheol_capsules_phase_id_fkey;

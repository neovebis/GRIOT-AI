# SHEOL v0.3 — Persistent Integration Boundary

SHEOL v0.3 connects the deterministic execution kernel to durable PostgreSQL state through an explicit adapter boundary.

## Runtime guarantees

- immutable mission constitution
- phase locking and dependency-safe execution
- isolated attempts
- explicit gate states PASS / FAIL / UNCERTAIN
- atomic commit boundary
- structured Continuity Capsules
- evidence-backed replan
- provider-neutral model workers
- local sandbox execution
- atomic PostgreSQL projection

## GRIOT integration

SHEOL is one engine inside GRIOT. It is not the Base semantic engine and it is not GRIOT GPU v2.

GRIOT Mobile local sandbox is a first-class execution plane. Supabase is persistence/control-plane infrastructure, not the local execution environment.

## Empirical target

A 5x improvement remains an empirical hypothesis measured with ERTS and secondary metrics. No 5x claim is made by this release.

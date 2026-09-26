# SHEOL Architecture Decision Records — v0.1

## ADR-001 — Kernel over framework
SHEOL is a kernel with explicit authority and state transitions, not a wrapper around an agent framework.

## ADR-002 — Artifact-first state
Committed artifacts, contracts, evidence, gates and events are authoritative. Conversation history is not.

## ADR-003 — One active phase by default
Phase advancement is serialized. Parallel branches are an optimization only when dependency analysis proves independence.

## ADR-004 — Attempt isolation
Each phase attempt is speculative. A failed attempt cannot contaminate official mission state.

## ADR-005 — Verification before commit
No mandatory gate pass means no commit. No commit means no downstream unlock.

## ADR-006 — Replan requires evidence
Replan is a versioned transaction requiring a reason, evidence and constitution compatibility.

## ADR-007 — Deterministic verification first
Schemas, compilers, tests and simulators should be used before an LLM judge whenever an objective verifier exists.

## ADR-008 — Selective multi-model execution
Choose one primary worker by capability and escalate only on risk, failure, uncertainty or explicit criticality policy.

## ADR-009 — Context minimization
Downstream workers receive only the SpineView, local phase contract, continuity capsule and authorized artifact/tool references required to execute the mission.

## ADR-010 — Benchmark before claims
The 5× target is a hypothesis to be measured against a fixed, reproducible baseline. It is never assumed from the architecture itself.

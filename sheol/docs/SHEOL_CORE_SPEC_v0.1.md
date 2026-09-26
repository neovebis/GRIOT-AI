# SHEOL Core Specification v0.1

## 1. Purpose

SHEOL is a mission execution kernel. Its job is to preserve global intent while allowing individual AI workers to solve bounded local tasks.

SHEOL is not a chat router, debate engine, agent swarm, or prompt wrapper.

## 2. Core abstraction

```
MISSION
  |
  +-- CONSTITUTION / SPINE
  |
  +-- EXECUTABLE PLAN
         |
         +-- PHASE 01 -> WORKER -> ARTIFACTS -> GATES -> COMMIT -> CAPSULE
         +-- PHASE 02 -> WORKER -> ARTIFACTS -> GATES -> COMMIT -> CAPSULE
         +-- ...
```

The vertical spine constrains every horizontal execution unit.

## 3. Constitution

Immutable for a mission lifetime. A fundamental change creates a new mission lineage.

Contains mission identity, objective, hard invariants, scope, forbidden scope, global constraints, architectural principles, success criteria, and execution policies.

## 4. Mission Intermediate Representation (MIR)

The planner produces structured plan data. A plan compiler validates dependency integrity, scope integrity, completeness, tool permissions and gate coverage before execution.

Plan revision is only through versioned replan.

## 5. Phase semantics

Each phase has:

- objective
- dependencies
- required outputs
- allowed write surface
- forbidden write surface
- allowed tools
- acceptance criteria

Only the active phase executes by default. Future phases are locked.

## 6. Worker isolation

Worker context is minimal and authorized:

1. read-only SpineView
2. current PhaseContract
3. ContinuityCapsule from the predecessor when one exists
4. explicit artifact references
5. explicit tool permissions
6. acceptance criteria

Historical transcripts and private reasoning are not authoritative state.

## 7. Local excellence / scope firewall

Workers maximize quality inside the authorized contract. They cannot expand scope, change forbidden artifacts, or change global architecture without replan.

## 8. Artifact-first state

Source of truth:

- committed artifacts
- contracts
- gate results
- evidence
- event ledger

Model narration is not authoritative.

## 9. Attempt isolation

Every execution attempt has its own boundary. Proposed artifacts become official only after all mandatory gates pass and the attempt commits.

## 10. Gate semantics

`PASS` = satisfied with evidence.

`FAIL` = objective violation or failed check.

`UNCERTAIN` = insufficient evidence.

Preferred validation order:

`Constitution -> Schema -> Contract -> Deterministic -> Functional -> Integration -> Semantic -> Adversarial`

Deterministic evidence should be preferred before LLM judgement where possible.

## 11. Continuity Capsule

A ContinuityCapsule is a structured execution-state contract compiled from artifacts, interfaces, decisions, evidence and gate results. It is not a narrative summary.

## 12. Rework

Recoverable gate failure creates a new attempt in the same phase.

Failed attempts remain uncommitted.

## 13. Replan

Replan requires:

- reason
- evidence
- versioned proposed plan
- constitution compatibility
- structural plan validation

Constitution does not mutate in place.

## 14. Authority hierarchy

```
Constitution
    |
    +-- Plan Compiler
          |
          +-- Execution Kernel
                |
                +-- Phase Controller
                      |
                      +-- Worker
```

Lower layers cannot mutate higher-authority layers.

## 15. Event Ledger

Every state-changing operation emits an immutable event containing id, mission id, phase/attempt reference, type, timestamp and structured data.

## 16. Initial implementation rule

Keep the first implementation monolithic and deterministic. Provider adapters, persistence, queues and distributed execution are extensions around the kernel.

## 17. Non-goals

- autonomous swarm as default
- unrestricted phase parallelism
- model authority over workflow
- LLM-only verification
- vector database as primary truth
- silent constitution mutation
- claiming a 5x improvement before measurement

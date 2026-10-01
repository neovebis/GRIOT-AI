# GRIOT v0.4.0 - Architecture Freeze

Status: FROZEN

Freeze scope:
- Integrated QUID/GIR semantic pipeline.
- Centralized context and bounded Working Graph.
- Unified proof-oriented reasoning with explicit epistemic states.
- Provenance and evidence preservation.
- Ambiguity, polysemy, coreference, discourse context, metaphor and semantic intent layers.
- Deterministic mathematics, simulation, planning, hypotheses, counterfactuals, causality and verification.
- Staged learning, validation, deduplication, consolidation, promotion, demotion, versioning and incremental learning.
- SQLite storage, indexes, sharding, cache, distributed Working Graph and selective retrieval.
- Adversarial, semantic, reasoning, memory, contradiction and scale validation.
- Legacy module compatibility isolated from the canonical engine contract.

Freeze invariants:
1. QUID identity remains exactly one Unicode code point.
2. GIR is versioned and validated.
3. Reasoning never treats UNKNOWN or CONFLICT as a positive boolean answer.
4. Provenance remains outside QUID identity.
5. Working Graph and context are transient.
6. Hypotheses and simulations do not silently mutate durable memory.
7. The canonical griot_engine.GRIOT constructor remains explicit.
8. Historical zero-argument construction exists only through griot.engine.
9. Package versioning (0.9.0) is independent from this architecture milestone (0.4.0).

Validation at freeze:
- Dedicated architecture/integration suite: green.
- Full unittest discover: 295 tests, all green on the validated freeze parent.
- Final validated parent: cb1d564e59e345941dc9601b4195868e51e362f5.

Post-freeze rule:
Changes that alter these invariants belong to the next architecture milestone. They should not be silently folded into GRIOT v0.4.0.

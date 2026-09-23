# GRIOT Semantic Engine

## Releases

- v0.1.0: foundational numeric/semantic engine, QUID registry, four bases, ten families, graph reasoning, simulation, persistence and API.
- v0.2.0: additive QUID-grounded semantic intermediate representation.

## v0.2.0

GRIOT is the engine itself. QUIDs are atomic representations; every QUID is exactly one Unicode code point. Rich definitions, properties, evidence, events and learned relations live outside the symbol.

The semantic IR compiles text into:
- entity and event nodes backed by QUIDs
- typed semantic edges
- agent/patient roles for actions
- negation
- modality
- temporal context
- numeric constraints
- deterministic composed meaning vectors

The learning facade inserts the compiled semantic facts into the existing GRIOT graph.

The original v0.1.0 engine remains in griot_engine.py. The v0.2.0 layer is in griot_semantic_ir.py and is additive, preserving rollback/recovery.

This remains a symbolic/numeric research engine, not a claim of unrestricted natural-language understanding.

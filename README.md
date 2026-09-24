# GRIOT Semantic Engine

GRIOT is the intelligence engine. QUIDs are its atomic semantic representations; each QUID is exactly one Unicode code point and is never a multi-character token.

Architecture:
- Base 1: primitive semantic operators.
- Base 2: foundational concepts and transitions.
- Base 3: scenes represented by one QUID with structure stored externally.
- Base 4: rich high-level concepts represented by one QUID with learned structure stored externally.

There are exactly 10 semantic families, IDs 1..10. IDs may be serialized with padding such as 01 or 0000000001 without changing identity.

## Releases

- v0.1.0: numeric/semantic substrate, QUID registry, four bases, ten families, graph, simulation, persistence and API.
- v0.2.0: QUID-grounded semantic intermediate representation with roles, negation, modality, time and numeric meaning.
- v0.3.0: deterministic structured knowledge induction: definitions, properties, ranges, conditionals, causal explanations and contradiction accounting.
- v0.4.0: proof-oriented reasoning with supported/refuted/conflict/unknown states, provenance-aware proof steps and causal lookup.

The layers are additive. The historical implementation remains recoverable.

This is a symbolic/numeric research engine, not a claim of unrestricted natural-language understanding.

## Run

```bash
python -m unittest discover -s tests -v
python -m griot
```

## Local API

```bash
python -c "from griot.server import serve; serve()"
```

Endpoints:
- GET /state
- POST /understand
- POST /learn
- POST /ask
- POST /calculate

## v0.5.0

Adds provisional hypothesis generation (analogy, composition and causal patterns) plus isolated counterfactual interventions. Hypotheses are never automatically committed to memory.

## v0.6.0

Adds self-assessment of conclusions and hypothesis-to-prediction experiment planning. The metacognitive layer reports caveats and verification actions without mutating durable knowledge.

## v0.7.0

Adds an operational causal world model with multi-step simulation, fixed-point propagation, isolated counterfactual world comparison and backward causal planning.

## v0.8.0

Adds explicit action schemas, preconditions/effects, cost-aware symbolic goal search, causal consequence propagation after actions and replay-based plan verification.

## v0.9.0

Adds two-phase autonomous learning: staging/induction first, then gated consolidation with corroboration and conflict holds. Durable memory is never updated during observation.

# GRIOT Semantic Engine Architecture

## Core distinction

**GRIOT is the intelligence engine. QUIDs are its representations.**

A QUID is not an LLM, not a model and not a sentence token. The invariant is strict: one QUID equals one Unicode code point.

Long names, definitions, properties, evidence, provenance, relations and learned structure live outside the QUID symbol in numeric and graph layers.

## Base hierarchy

### Base 1 - Primitive
Atomic semantic operators: existence, identity, part-of, membership, property, action, change, causality, negation, conjunction, disjunction, time, space, agency and epistemic markers.

### Base 2 - Foundation
Reusable concepts for action/result, state/change, event, cause/effect, reaction, condition, interaction, duration, agency and temporal structure.

### Base 3 - Scene
A scene is represented by one QUID. Its internal structure is external: component QUIDs and typed edges compose the scene.

### Base 4 - Rich
High-level concepts/entities are represented by one QUID and backed by richer graph structure. Example: `🦁` represents *Panthera leo*; mane, mass, habitat and behavior remain graph knowledge rather than characters inside the QUID.

## Ten semantic families

Families are fixed at IDs 1..10. IDs can be padded for serialization without changing identity.

1. ONTOLOGY
2. RELATION
3. PROPERTY
4. ACTION
5. STATE
6. CAUSALITY
7. LOGIC
8. SPATIOTEMPORAL
9. AGENCY
10. EPISTEMIC

## Numeric substrate

The numeric kernel provides deterministic signatures, vector algebra, cosine similarity, weighted composition, matrix multiplication, determinant calculation, linear-system solving, exact fractions, statistics and restricted safe expression evaluation.

Deterministic signatures are representation tools, not claimed trained embeddings.

## Semantic intermediate representation

Text can be compiled into a typed semantic graph containing:
- entity nodes backed by QUIDs;
- event/scene nodes backed by one QUID;
- semantic relations;
- agent/patient roles;
- polarity/negation;
- modality;
- temporal context;
- numeric constraints;
- deterministic composed meaning vectors.

## Structured knowledge induction

Phase-2 induction extracts reusable structures from hygienized text:
- nested definitions;
- properties;
- numeric ranges and units;
- conditional implication structures;
- causal explanations;
- contradiction evidence.

No neural training is performed by these layers.

## Proof-oriented reasoning

The reasoning controller classifies a proposition as:
- supported;
- refuted;
- conflict;
- unknown.

Proof steps include relation, confidence, rule and provenance. Transitive support and causal lookup provide explicit evidence trails.

The graph remains separate from QUID identity so learning can extend knowledge without mutating the atomic QUID symbol.

## Versioning invariant

Each release is additive where practical. v0.1.0 remains recoverable, while semantic IR, structured induction and proof reasoning are layered on top.

## Hypothesis and counterfactual layer

The v0.5 layer explores unknown propositions without mutating durable memory. It can generate provisional analogical, compositional and causal hypotheses and run isolated counterfactual interventions. Hypotheses remain explicitly heuristic and are never promoted to facts automatically.

## Metacognitive layer

The v0.6 layer evaluates conclusions using proof class, confidence, provenance diversity and inference depth. It emits explicit caveats and verification recommendations.

## Experiment planning

The planner takes a provisional hypothesis and derives graph-based predictions in an isolated sandbox. Predicted consequences are observations to test; they are never written as durable facts automatically.

Future work: richer world models, stronger language understanding and tool-grounded action.

## Operational world model

The v0.7 layer interprets supported causal edges as transition rules over a simulated active-state world. It records transition events, propagates consequences to a fixed point, compares counterfactual interventions and searches backward causal chains for target states. Simulation is isolated from durable semantic memory.


## Goal-oriented planning

The v0.8 layer represents actions with one scene QUID plus explicit preconditions, add/remove effects, cost, confidence and provenance. A deterministic cost-aware search explores transient QUID world states. Each candidate plan is replayed and verified after search; planning does not mutate durable memory.


## Autonomous learning loop

The v0.9 layer separates observation from consolidation. Hygienized text is compiled into candidate facts in a staging ledger; candidates are grouped, checked for opposite-polarity conflicts, evaluated by confidence and source diversity, and only accepted candidates enter durable memory. Held candidates remain unresolved rather than being overwritten.

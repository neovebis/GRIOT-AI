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

## Formal GIR contract

The semantic intermediate representation is exposed through a versioned GIR contract.

GIR invariants:
- every node references exactly one QUID symbol, and that symbol is exactly one Unicode code point;
- node identifiers are unique and every edge endpoint must resolve to a declared node;
- node and edge confidence values are finite and constrained to 0..1;
- family identifiers remain constrained to the fixed 1..10 family space;
- known relations have canonical semantic families;
- edge polarity is explicit through negation;
- evidence and provenance are first-class hooks;
- temporal, modal and numeric constraints remain explicit instead of being encoded inside QUID identity;
- the composed numeric vector is part of the representation but is not treated as trained embedding output;
- the schema is versioned and serialized through deterministic canonical JSON;
- GIR fingerprints are derived from that canonical representation, allowing integrity checks and cache/index keys without changing QUID identity.

`MeaningRepresentation` remains the compatibility-facing semantic type, but it is now an immutable GIR instance. Reasoning consumes the same GIR object produced by semantic compilation, so semantic parsing is not repeated between representation and proof layers.
## Centralized context engine

Transient discourse context is owned by the GRIOT engine through a bounded Context Engine.

The context layer:
- stores validated GIR records without writing durable graph facts;
- preserves turn order, source and GIR fingerprint for traceability;
- indexes QUID mentions and relations;
- computes deterministic recency/salience scores;
- exposes active QUIDs and a current topic view;
- ranks prior GIR records against a query using shared QUIDs, shared relations and recency;
- remains independent from truth decisions, so context can be observed before it is allowed to influence proof conclusions.

Context is intentionally transient. Durable knowledge remains in the knowledge graph, while context acts as working discourse memory between reasoning turns.
## Unified reasoning, provenance and epistemic state

Reasoning is centralized in a single `ReasoningEngine` over the validated GIR.

The reasoning layer evaluates every query relation represented in the GIR, preserves requested polarity, aggregates claim statuses, and emits explicit proof steps. Transient context is attached to the result but cannot establish truth by itself.

Provenance is structured separately from QUID identity and graph facts. An epistemic state records supported, refuted, conflict or unknown status together with confidence, evidence counts, proof depth, source diversity, caveats and an abstention flag.

Independent-source diversity counts direct evidence sources only; inference-rule labels and derived proof steps do not become independent sources. The epistemic gate consumes this structured assessment and can refuse to emit an answer for unknown, conflict, low-confidence, insufficient-source or excessive-depth cases.
## Working Graph

The Working Graph is the bounded transient evidence graph for one reasoning cycle.

It assembles the current GIR, exact durable evidence for queried relations, rule-derived inferences and selected records from discourse context. Duplicate semantic keys are collapsed only when their full provenance identity is the same; distinct direct sources remain distinct.

Working Graph state is disposable and separate from durable memory. It is used to constrain retrieval and give later planning/reasoning stages a bounded evidence surface without mutating the knowledge graph or QUID registry.
## Query Planner

The Query Planner is the explicit retrieval boundary between GIR/context and Working Graph.

It canonicalizes query targets, records a bounded retrieval budget, selects relevant discourse records, and declares its retrieval strategies before execution. Execution retrieves exact durable evidence, rule-derived inferences and all direct source facts supporting those inferences, then materializes the selected context records into the transient Working Graph.

Plans are tied to the GIR fingerprint and have their own deterministic fingerprint. This allows retrieval decisions to be audited, cached or compared without changing QUID identity or durable memory.
## Ambiguity resolution

B1 adds an explicit lexical ambiguity layer before semantic reasoning.

`AmbiguityResolver` maintains documented alternative senses for selected lexical forms, scores those senses using local text and prior discourse context, and returns the full candidate set, chosen sense, confidence and resolution status.

Ambiguity is never silently collapsed: ties and insufficient context remain `ambiguous`, with candidate QUIDs preserved in GIR constraints. A resolved sense changes the semantic node's QUID while retaining the original surface form for traceability.

B1 is deliberately narrower than full polysemy. Systematic sense relationships and sense-specific knowledge networks are deferred to B2.
## Mathematics and simulation

C1 adds a deterministic mathematics layer with exact rational evaluation where possible and explicit approximate/invalid states otherwise.

C2 formalizes the existing world simulator as `SimulationEngine`. Deterministic rule execution returns immutable state trajectories, terminal state, rule counts and executed-step count. Monte Carlo execution exposes run count, step count, seed and aggregate statistics.

Simulation is isolated from durable semantic memory: executing a scenario does not write facts into the knowledge graph. The public `Quid` facade exposes programmatic simulation APIs while natural-language simulation intent remains a separate semantic layer until scenario extraction is implemented in later reasoning phases.
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


## GRIOT v0.4 hardening status

F8 consolidates the runtime compatibility, storage idempotence, semantic learning edge cases, adversarial input handling, selective retrieval, distributed Working Graph contract and legacy-module interoperability required before the architecture freeze.

The canonical engine constructor remains explicit; historical zero-argument construction is isolated to the `griot.engine` compatibility facade. Package/distribution versioning is intentionally separate from the architecture milestone.

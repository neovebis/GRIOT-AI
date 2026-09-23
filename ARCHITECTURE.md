# GRIOT Semantic Engine Architecture

## Core distinction

GRIOT is the intelligence engine. QUIDs are its representations.

A QUID is not an LLM, not a model and not a sentence token. The invariant is strict: one QUID equals one Unicode code point.

Long names, definitions, properties, evidence, provenance, relations and learned structure live outside the QUID symbol in the numeric and graph layers.

## Base hierarchy

### Base 1 - Primitive
Atomic semantic operators such as existence, identity, part-of, relation, action, change, causality, negation, conjunction, time, space and goal.

### Base 2 - Foundation
Reusable cognitive primitives such as action, result, state, event, cause, effect, reaction, condition, duration and interaction.

### Base 3 - Scene
A scene is represented by one QUID symbol. Its internal structure is external: component QUIDs and graph relations compose the scene.

### Base 4 - Rich
High-level concepts represented by one QUID and backed by richer graph structure. Example: the lion QUID is the single symbol 🦁 whose canonical label is Panthera leo; properties such as mane, mass and behavior are learned graph facts.

## Ten semantic families

Families are fixed at IDs 1..10. IDs may be padded for serialization, but the semantic identity is the same.

## Numerical substrate

The numeric kernel provides deterministic signatures, vector algebra, cosine similarity, matrix operations, determinant calculation, linear solving, exact fractions, statistics and a restricted expression evaluator.

Deterministic signatures are a representation mechanism; they are not claimed to be trained embeddings.

## Knowledge substrate

The graph stores positive and negative facts, confidence, provenance, evidence text, contradictions, transitive inference and explicit rule inference.

The graph is intentionally separate from QUID identity so learning does not mutate the meaning of a QUID by changing its symbol.

## Phase 2 learning bridge

Hygienized text is converted into propositions and then graph facts. Unknown concepts converge to newly allocated one-character QUIDs. This is a deterministic induction bridge, not model training.

Future work can add richer parsers, formal concept induction, probabilistic inference, self-evaluation, experiment planning and external tools without changing the atomic QUID invariant.

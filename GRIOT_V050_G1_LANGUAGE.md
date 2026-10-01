# GRIOT v0.5 — G1 Language Intelligence

Status: **in implementation**

G1 is the language-intelligence front-end of the post-v0.4 evolution. It does not replace the formal GIR/QUID core. It supplies structured linguistic evidence to the semantic compiler.

## Pipeline

`text → tokenization → morphology → shallow syntax → semantic roles → linguistic features → GIR`

## Current G1 contract

- deterministic tokenization with preserved punctuation;
- lemma normalization;
- part-of-speech tagging for the supported Portuguese grammar;
- tense detection: present, past perfect, past imperfect, future, conditional, infinitive, gerund and participle;
- aspect detection: progressive and perfect;
- modal semantics: possibility, necessity and epistemic/certainty markers;
- negation detection;
- semantic roles: agent, experiencer, patient, recipient, location, instrument and temporal;
- quantifiers: universal, existential, negative-universal, distributive, dual and indefinite;
- comparisons: greater-than, less-than and equal-degree;
- conditionals with explicit condition/consequent spans;
- relation extraction for the semantic relations already supported by GRIOT;
- auxiliary-aware predicate selection for constructions such as `estava atacando`, `tinha atacado` and `vai criar`.

## Integration invariant

The linguistic analysis is embedded in the GIR constraints under the `language` key. Existing QUID identity, provenance, epistemic state and reasoning contracts remain unchanged.

G1 is intentionally deterministic at this layer. Ambiguous or unsupported language remains explicit rather than being silently fabricated.

# GRIOT Semantic Engine v0.1.0

GRIOT is the engine itself. QUIDs are atomic semantic representations used by GRIOT; a QUID is exactly one Unicode code point and is never a multi-character token.

## Four semantic bases

- Base 1: primitive semantic operators
- Base 2: foundational concepts — action, result, state, cause/effect, condition, time, space and agency
- Base 3: scenes — one-character scene QUIDs whose contents live in graph relations
- Base 4: rich QUIDs — one-character high-level concepts linked to lower-level structure. Example: 🦁 = Panthera leo.

## Ten fixed semantic families

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

Family IDs are numeric and may be serialized with padding (01 or 0000000001) without changing identity.

## Implemented

- intent detection and semantic frames
- numeric signatures and cosine operations
- knowledge graph with provenance, confidence, negative evidence and contradiction detection
- transitive and causal rule inference
- safe mathematical expression evaluation
- determinants and Gaussian-elimination linear solving
- deterministic transition simulation and Monte Carlo simulation
- hygienized Portuguese text induction
- JSON snapshots
- localhost HTTP API
- automated tests

This is a symbolic/numeric cognitive substrate, not a pretrained LLM and not a claim of human-level language understanding.

Run locally:
```bash
PYTHONPATH=. python -m unittest discover -s tests -v
PYTHONPATH=. python -m griot_engine
```

# GRIOT v0.5 — G2 Knowledge Acquisition

G2 adds the acquisition front-end that turns external sources into structured GRIOT knowledge while keeping the existing D1-D8 learning primitives.

## Pipeline

`Fonte → documento → extração → resolução de entidades → eventos/tempo → QUIDs → validação → deduplicação → conflito/revisão → consolidação → memória → versão`

### 1. Sources and documents

`KnowledgeSource` identifies where knowledge came from and carries kind, URI, title, version, timestamp and metadata.

`KnowledgeDocument` gives each source document a deterministic content fingerprint and document identity. Re-ingesting identical content is a no-op.

Supported local document formats are UTF-8 TXT, Markdown, RST, LOG and JSON. JSON accepts a top-level `text`, `content` or `body` field and can recursively collect textual values.

### 2. Entity resolution

G2 resolves an extracted entity against the QUID registry using:

1. exact registry lookup;
2. case/diacritic/punctuation-insensitive label or alias matching;
3. creation of a new QUID when no existing identity is safe to reuse.

Fuzzy semantic merging is intentionally not performed. An uncertain match becomes a new QUID instead of silently collapsing two entities.

### 3. Extraction

The existing semantic compiler and G1 language layer provide:

- relations and facts;
- entity nodes;
- tense and aspect;
- negation and modality;
- semantic roles;
- quantifiers and comparisons;
- conditional structures;
- discourse-aware context already present in the semantic pipeline.

G2 materializes acquisition records for event relations and temporal markers, and preserves source evidence on the resulting facts.

### 4. Validation

Every extracted candidate is checked for:

- valid one-code-point QUID references;
- known GIR relation families;
- finite confidence in 0..1;
- GIR fingerprint consistency;
- exact duplicates already present in durable memory;
- opposite-polarity evidence already in memory.

### 5. Semantic deduplication

Candidates sharing the same subject/relation/object are grouped. A deterministic representative is selected from non-conflicting candidates using confidence and stable provenance/evidence ordering.

Contradictory positive/negative candidates in the same acquisition batch are not silently collapsed.

### 6. Consolidation

Only the effective validated representatives are committed to the durable graph. Rejected and conflicting candidates remain observable in the acquisition report.

### 7. Review

The acquisition engine exposes a review queue.

- `auto_commit=True`: valid knowledge is committed automatically; invalid/conflicting knowledge is queued.
- `auto_commit=False`: valid candidates are staged and queued before any durable write.
- `review(id, "reject")`: rejects a candidate.
- `review(id, "approve")`: permits human override of a conflict, but never permits malformed QUID/relation/confidence data.

### 8. Incremental source updates

Documents have stable IDs and content fingerprints. Replacing a changed document transactionally removes facts previously attributed to that source document, extracts the new state, validates it and commits the replacement.

This requires `KnowledgeGraph.remove_fact()`, which also rebuilds contradiction indexes so graph state remains coherent after retraction.

Facts from other sources remain untouched. Therefore replacing one source does not erase independent evidence from another source.

### 9. Provenance and confidence

Facts continue to store:

- confidence;
- provenance/source ID;
- evidence text;
- optional timestamp.

G2 also exposes structured document/source metadata and extracted event confidence.

### 10. Versioning

The existing immutable `KnowledgeVersionStore` is used for acquisition commits. G2 only creates a new knowledge version when the durable fact set changes.

Each report includes a `KnowledgeDiff` with added and removed facts.

## Public API

The high-level facade exposes:

- `Quid.acquire_knowledge(...)`
- `Quid.acquire_document(...)`
- `Quid.acquire_file(...)`
- `Quid.review_knowledge(...)`
- `Quid.knowledge_review_queue()`
- `Quid.assess_acquired_knowledge()`

The implementation is deterministic and model-free at the acquisition layer. It is designed to consume richer parsers/models later without changing the G2 memory contract.

## Scope boundary

G2 is an acquisition and memory-ingestion layer, not a replacement for general language intelligence or advanced reasoning.

G1 remains responsible for linguistic interpretation.

G3 will be responsible for automatic decomposition, advanced multi-hop reasoning, proof-oriented strategy selection and higher-order reasoning.

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from griot_engine import Fact, GRIOT
from griot_gir import GIR
from griot_semantic_ir import SemanticGRIOT


@dataclass(frozen=True, slots=True)
class ExtractionCandidate:
    fact: Fact
    source_text: str
    gir_fingerprint: str
    extraction_confidence: float


@dataclass(frozen=True, slots=True)
class ExtractionBatch:
    text: str
    gir: GIR
    candidates: tuple[ExtractionCandidate, ...]

    @property
    def quids(self) -> tuple[str, ...]:
        return tuple(sorted({
            value
            for candidate in self.candidates
            for value in (candidate.fact.subject, candidate.fact.object)
        }))


class KnowledgeExtractor:
    """Extract semantic facts into a staging object without committing memory."""

    def __init__(self, engine: GRIOT | None = None) -> None:
        self.engine = engine or GRIOT.create()
        self.semantic = SemanticGRIOT(self.engine)

    def extract(self, text: str) -> ExtractionBatch:
        if not isinstance(text, str):
            raise TypeError("text must be a string")
        gir = self.semantic.understand(text)
        candidates = tuple(
            ExtractionCandidate(
                fact=fact,
                source_text=text,
                gir_fingerprint=gir.fingerprint(),
                extraction_confidence=max(0.0, min(1.0, float(fact.confidence))),
            )
            for fact in gir.facts()
        )
        return ExtractionBatch(text, gir, candidates)

    def extract_many(self, texts: Iterable[str]) -> tuple[ExtractionBatch, ...]:
        return tuple(self.extract(text) for text in texts)


__all__ = ["ExtractionBatch", "ExtractionCandidate", "KnowledgeExtractor"]

from __future__ import annotations

from dataclasses import dataclass
import math

from griot_cache import GenerationCache
from griot_engine import Fact, GRIOT
from griot_indices import FactIndices


@dataclass(frozen=True, slots=True)
class RetrievalItem:
    fact: Fact
    score: float
    reason: str


@dataclass(frozen=True, slots=True)
class RetrievalResult:
    items: tuple[RetrievalItem, ...]
    budget: int
    truncated: bool

    @property
    def facts(self) -> tuple[Fact, ...]:
        return tuple(item.fact for item in self.items)


class SelectiveRetriever:
    """Bounded evidence retrieval using exact, neighborhood and confidence signals."""

    def __init__(self, engine: GRIOT, budget: int = 64) -> None:
        if budget <= 0:
            raise ValueError("budget must be positive")
        self.engine = engine
        self.budget = budget
        self.indices = FactIndices()
        self._indexed_count = -1
        self.cache = GenerationCache[tuple[Fact, ...]]()

    def retrieve(
        self,
        *,
        subject: str | None = None,
        relation: str | None = None,
        object_: str | None = None,
    ) -> RetrievalResult:
        self._refresh()

        candidates: dict[Fact, tuple[float, str]] = {}

        exact = ()
        if subject is not None and relation is not None and object_ is not None:
            exact = self.indices.query(
                subject=subject,
                relation=relation,
                object_=object_,
            )
        for fact in exact:
            candidates[fact] = (
                1.00 + 0.15 * float(fact.confidence),
                "exact",
            )

        anchors = {value for value in (subject, object_) if value is not None}
        if anchors:
            for anchor in anchors:
                neighbor_facts = self.indices.query(subject=anchor)
                for fact in neighbor_facts:
                    if fact in candidates:
                        continue
                    score = 0.65 + 0.10 * float(fact.confidence)
                    candidates[fact] = (score, "subject-neighborhood")

                inverse_neighbors = [
                    fact
                    for fact in self.indices.query(object_=anchor)
                    if fact not in candidates
                ]
                for fact in inverse_neighbors:
                    candidates[fact] = (
                        0.58 + 0.10 * float(fact.confidence),
                        "object-neighborhood",
                    )

        ranked = sorted(
            (
                RetrievalItem(fact, score, reason)
                for fact, (score, reason) in candidates.items()
            ),
            key=lambda item: (
                -item.score,
                item.fact.subject,
                item.fact.relation,
                item.fact.object,
                item.fact.provenance,
            ),
        )
        truncated = len(ranked) > self.budget
        return RetrievalResult(tuple(ranked[: self.budget]), self.budget, truncated)

    def _refresh(self) -> None:
        count = len(self.engine.graph.facts())
        if count != self._indexed_count:
            self.indices.rebuild(self.engine.graph.facts())
            self._indexed_count = count
            self.cache.invalidate()


__all__ = ["RetrievalItem", "RetrievalResult", "SelectiveRetriever"]

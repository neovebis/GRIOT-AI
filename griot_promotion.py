from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable

from griot_engine import Fact


class KnowledgeLevel(str, Enum):
    CANDIDATE = "candidate"
    PROMOTED = "promoted"
    DEMOTED = "demoted"


@dataclass(frozen=True, slots=True)
class PromotionPolicy:
    min_sources: int = 2
    min_confidence: float = 0.90

    def __post_init__(self) -> None:
        if self.min_sources <= 0:
            raise ValueError("min_sources must be positive")
        if not 0.0 <= self.min_confidence <= 1.0:
            raise ValueError("min_confidence must be in 0..1")


@dataclass(frozen=True, slots=True)
class KnowledgeAssessment:
    key: tuple[str, str, str, bool]
    level: KnowledgeLevel
    evidence_count: int
    source_count: int
    confidence: float
    sources: tuple[str, ...]


class KnowledgePromotionEngine:
    """Maintain a trust level over semantic facts without rewriting their identity."""

    def __init__(self, policy: PromotionPolicy | None = None) -> None:
        self.policy = policy or PromotionPolicy()
        self._levels: dict[tuple[str, str, str, bool], KnowledgeAssessment] = {}

    @staticmethod
    def key(fact: Fact) -> tuple[str, str, str, bool]:
        return (fact.subject, fact.relation, fact.object, bool(fact.negated))

    def assess(self, facts: Iterable[Fact]) -> tuple[KnowledgeAssessment, ...]:
        grouped: dict[tuple[str, str, str, bool], list[Fact]] = {}
        for fact in facts:
            grouped.setdefault(self.key(fact), []).append(fact)

        output: list[KnowledgeAssessment] = []
        for key, group in sorted(grouped.items()):
            sources = tuple(sorted({fact.provenance for fact in group if fact.provenance}))
            confidence = max(float(fact.confidence) for fact in group)
            previous = self._levels.get(key)
            if (
                len(sources) >= self.policy.min_sources
                and confidence >= self.policy.min_confidence
            ):
                level = KnowledgeLevel.PROMOTED
            elif previous is not None and previous.level is KnowledgeLevel.PROMOTED:
                level = KnowledgeLevel.PROMOTED
            else:
                level = KnowledgeLevel.CANDIDATE

            assessment = KnowledgeAssessment(
                key,
                level,
                len(group),
                len(sources),
                confidence,
                sources,
            )
            self._levels[key] = assessment
            output.append(assessment)
        return tuple(output)

    def level(self, fact: Fact) -> KnowledgeLevel:
        return self._levels.get(self.key(fact), KnowledgeAssessment(
            self.key(fact), KnowledgeLevel.CANDIDATE, 0, 0, 0.0, ()
        )).level

    def snapshot(self) -> tuple[KnowledgeAssessment, ...]:
        return tuple(
            self._levels[key]
            for key in sorted(self._levels)
        )


__all__ = [
    "KnowledgeAssessment",
    "KnowledgeLevel",
    "KnowledgePromotionEngine",
    "PromotionPolicy",
]

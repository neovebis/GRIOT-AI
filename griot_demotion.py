from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from griot_engine import Fact, GRIOT
from griot_promotion import KnowledgeLevel, KnowledgePromotionEngine


@dataclass(frozen=True, slots=True)
class DemotionAssessment:
    key: tuple[str, str, str, bool]
    previous_level: KnowledgeLevel
    level: KnowledgeLevel
    reason: str
    evidence_count: int
    source_count: int
    confidence: float


class KnowledgeDemotionEngine:
    """Detect contradiction or evidence decay and explicitly demote knowledge."""

    def __init__(self, engine: GRIOT, promotion: KnowledgePromotionEngine) -> None:
        self.engine = engine
        self.promotion = promotion

    def reconcile(self, facts: Iterable[Fact] | None = None) -> tuple[DemotionAssessment, ...]:
        facts_tuple = tuple(facts) if facts is not None else tuple(self.engine.graph.facts())
        grouped: dict[tuple[str, str, str], list[Fact]] = {}
        for fact in facts_tuple:
            grouped.setdefault((fact.subject, fact.relation, fact.object), []).append(fact)

        assessments: list[DemotionAssessment] = []
        for semantic_key, group in sorted(grouped.items()):
            positives = [fact for fact in group if not fact.negated]
            negatives = [fact for fact in group if fact.negated]
            for polarity, subset in ((False, positives), (True, negatives)):
                if not subset:
                    continue
                key = (*semantic_key, polarity)
                representative = max(subset, key=lambda fact: float(fact.confidence))
                previous = self.promotion.level(representative)
                if previous is not KnowledgeLevel.PROMOTED:
                    continue

                sources = {fact.provenance for fact in subset if fact.provenance}
                conflicting = bool(positives and negatives)
                confidence = max(float(fact.confidence) for fact in subset)

                if conflicting:
                    level = self.promotion.demote(representative).level
                    reason = "contradictory-polarity-evidence"
                elif not sources:
                    level = self.promotion.demote(representative).level
                    reason = "evidence-without-source"
                elif confidence < self.promotion.policy.min_confidence:
                    level = self.promotion.demote(representative).level
                    reason = "confidence-decay"
                elif len(sources) < self.promotion.policy.min_sources:
                    level = self.promotion.demote(representative).level
                    reason = "source-diversity-decay"
                else:
                    level = previous
                    reason = "stable"

                assessments.append(
                    DemotionAssessment(
                        key,
                        previous,
                        level,
                        reason,
                        len(subset),
                        len(sources),
                        confidence,
                    )
                )
        return tuple(assessments)


__all__ = ["DemotionAssessment", "KnowledgeDemotionEngine"]

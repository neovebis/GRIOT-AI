from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable

from griot.engine import GRIOT
from griot.types import Fact
from griot_learning_v030 import KnowledgeInducer


class ConsolidationDecision(str, Enum):
    ACCEPT = "accept"
    HOLD = "hold"
    REJECT = "reject"


@dataclass(frozen=True, slots=True)
class CandidateFact:
    fact: Fact
    source: str


@dataclass(frozen=True, slots=True)
class ConsolidationRecord:
    fact: Fact
    decision: ConsolidationDecision
    support_count: int
    source_diversity: int
    rationale: str


@dataclass(frozen=True, slots=True)
class LearningBatchReport:
    observed: int
    accepted: int
    held: int
    rejected: int
    records: tuple[ConsolidationRecord, ...]


class AutonomousLearner:
    """
    Two-phase autonomous acquisition:
      1. observe/induce into a staging ledger;
      2. consolidate into durable memory only after consistency/support checks.

    Staging never mutates durable graph facts. Hypotheses are not facts.
    """

    def __init__(self, engine: GRIOT | None = None) -> None:
        from griot_semantic_ir import SemanticGRIOT
        self.engine = engine or GRIOT()
        self.inducer = KnowledgeInducer(SemanticGRIOT(self.engine))
        self._staging: list[CandidateFact] = []

    def observe(self, text: str, source: str = "text") -> tuple[CandidateFact, ...]:
        semantic = self.inducer.semantic.understand(text)
        candidates = tuple(CandidateFact(f, source) for f in semantic.facts())
        self._staging.extend(candidates)
        return candidates

    def observe_many(self, documents: Iterable[tuple[str, str]]) -> int:
        total = 0
        for text, source in documents:
            total += len(self.observe(text, source))
        return total

    def staging(self) -> tuple[CandidateFact, ...]:
        return tuple(self._staging)

    def clear_staging(self) -> None:
        self._staging.clear()

    def consolidate(
        self,
        *,
        min_confidence: float = 0.75,
        corroboration_threshold: int = 2,
    ) -> LearningBatchReport:
        if not 0.0 <= min_confidence <= 1.0:
            raise ValueError("min_confidence must be between 0 and 1")
        if corroboration_threshold <= 0:
            raise ValueError("corroboration_threshold must be > 0")

        groups: dict[tuple[str, str, str, bool], list[CandidateFact]] = {}
        for candidate in self._staging:
            f = candidate.fact
            groups.setdefault((f.subject, f.relation, f.object, f.negated), []).append(candidate)

        records: list[ConsolidationRecord] = []
        accepted = held = rejected = 0

        for key, candidates in sorted(groups.items()):
            subject, relation, object_, negated = key
            opposite_key = (subject, relation, object_, not negated)
            opposite_durable = any(
                (f.subject, f.relation, f.object, f.negated) == opposite_key
                for f in self.engine.graph.facts()
            )
            opposite_staged = opposite_key in groups

            support_count = len(candidates)
            source_diversity = len({c.source for c in candidates})
            confidence = max(c.fact.confidence for c in candidates)

            if opposite_durable or opposite_staged:
                decision = ConsolidationDecision.HOLD
                rationale = "conflicting polarity requires resolution before consolidation"
                held += 1
            elif confidence < min_confidence and support_count < corroboration_threshold:
                decision = ConsolidationDecision.REJECT
                rationale = "insufficient confidence and corroboration"
                rejected += 1
            else:
                decision = ConsolidationDecision.ACCEPT
                rationale = "confidence/corroboration threshold satisfied"
                consolidated_provenance = "autonomous:" + ",".join(sorted({c.source for c in candidates}))
                consolidated_evidence = " | ".join(
                    sorted({c.fact.evidence for c in candidates if c.fact.evidence})
                ) or None
                self.engine.graph.add_fact(
                    Fact(
                        subject,
                        relation,
                        object_,
                        confidence,
                        negated,
                        consolidated_provenance,
                        consolidated_evidence,
                    )
                )
                accepted += 1

            records.append(
                ConsolidationRecord(
                    fact=Fact(subject, relation, object_, confidence, negated, "staging"),
                    decision=decision,
                    support_count=support_count,
                    source_diversity=source_diversity,
                    rationale=rationale,
                )
            )

        self.clear_staging()
        return LearningBatchReport(len(records), accepted, held, rejected, tuple(records))


__all__ = [
    "ConsolidationDecision",
    "CandidateFact",
    "ConsolidationRecord",
    "LearningBatchReport",
    "AutonomousLearner",
]

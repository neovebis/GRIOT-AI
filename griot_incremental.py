from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from griot_consolidation import ConsolidationReport, KnowledgeConsolidator
from griot_deduplication import DeduplicationReport, SemanticDeduplicator
from griot_demotion import DemotionAssessment, KnowledgeDemotionEngine
from griot_extraction import ExtractionBatch, ExtractionCandidate, KnowledgeExtractor
from griot_promotion import KnowledgeAssessment, KnowledgePromotionEngine
from griot_validation import KnowledgeValidator, ValidationReport
from griot_versioning import KnowledgeDiff, KnowledgeVersion, KnowledgeVersionStore


@dataclass(frozen=True, slots=True)
class IncrementalUpdate:
    batch: ExtractionBatch
    validation: ValidationReport
    deduplication: DeduplicationReport
    consolidation: ConsolidationReport
    version: KnowledgeVersion
    diff: KnowledgeDiff
    promotion: tuple[KnowledgeAssessment, ...]
    demotion: tuple[DemotionAssessment, ...]
    changed: bool


class IncrementalLearner:
    """One-pass incremental learning coordinator over D1-D7 components."""

    def __init__(self, engine: object) -> None:
        self.engine = engine
        self.extractor = KnowledgeExtractor(engine)
        self.validator = KnowledgeValidator(engine)
        self.deduplicator = SemanticDeduplicator()
        self.consolidator = KnowledgeConsolidator(engine)
        self.promotion = KnowledgePromotionEngine()
        self.demotion = KnowledgeDemotionEngine(engine, self.promotion)
        self.versions = KnowledgeVersionStore()
        self._processed: set[tuple[str, str]] = set()

    def learn(self, text: str, *, source: str) -> IncrementalUpdate:
        batch = self.extractor.extract(text, source=source)
        key = (batch.gir.fingerprint(), source.strip())
        if key in self._processed:
            validation = self.validator.validate(batch)
            deduplication = self.deduplicator.deduplicate(
                item.candidate for item in validation.valid
            )
            empty = ConsolidationReport(())
            version = self.versions.head or self.versions.commit(self.engine.graph.facts())
            diff = KnowledgeDiff((), ())
            promotion = self.promotion.assess(self.engine.graph.facts())
            demotion = self.demotion.reconcile()
            return IncrementalUpdate(
                batch,
                validation,
                deduplication,
                empty,
                version,
                diff,
                promotion,
                demotion,
                False,
            )

        before_facts = tuple(self.engine.graph.facts())
        before = self.versions.head
        if before is None or set(before.facts) != set(before_facts):
            before = self.versions.commit(before_facts)

        validation = self.validator.validate(batch)
        deduplication = self.deduplicator.deduplicate(
            item.candidate for item in validation.valid
        )
        consolidation = self.consolidator.consolidate(validation, deduplication)
        after = self.versions.commit(self.engine.graph.facts())
        diff = before.diff(after)
        promotion = self.promotion.assess(self.engine.graph.facts())
        demotion = self.demotion.reconcile()
        self._processed.add(key)

        return IncrementalUpdate(
            batch,
            validation,
            deduplication,
            consolidation,
            after,
            diff,
            promotion,
            demotion,
            bool(consolidation.committed_count),
        )

    def learn_many(self, items: Iterable[tuple[str, str]]) -> tuple[IncrementalUpdate, ...]:
        return tuple(
            self.learn(text, source=source)
            for text, source in items
        )


__all__ = ["IncrementalLearner", "IncrementalUpdate"]

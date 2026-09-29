from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from griot_engine import Fact, GRIOT
from griot_deduplication import DeduplicationGroup, DeduplicationReport
from griot_validation import ValidationReport, ValidationStatus


@dataclass(frozen=True, slots=True)
class ConsolidationRecord:
    semantic_key: tuple[str, str, str]
    committed: tuple[Fact, ...]
    skipped: tuple[Fact, ...]
    sources: tuple[str, ...]
    conflict: bool


@dataclass(frozen=True, slots=True)
class ConsolidationReport:
    records: tuple[ConsolidationRecord, ...]

    @property
    def committed(self) -> tuple[Fact, ...]:
        return tuple(fact for record in self.records for fact in record.committed)

    @property
    def skipped(self) -> tuple[Fact, ...]:
        return tuple(fact for record in self.records for fact in record.skipped)

    @property
    def committed_count(self) -> int:
        return len(self.committed)

    @property
    def changed(self) -> bool:
        return bool(self.committed)


class KnowledgeConsolidator:
    """Commit validated, semantically deduplicated knowledge into durable graph memory."""

    def __init__(self, engine: GRIOT) -> None:
        self.engine = engine

    def consolidate(
        self,
        validation: ValidationReport,
        deduplication: DeduplicationReport,
    ) -> ConsolidationReport:
        if not isinstance(validation, ValidationReport):
            raise TypeError("validation must be a ValidationReport")
        if not isinstance(deduplication, DeduplicationReport):
            raise TypeError("deduplication must be a DeduplicationReport")

        valid_keys = {
            (
                item.candidate.fact.subject,
                item.candidate.fact.relation,
                item.candidate.fact.object,
                item.candidate.fact.negated,
            )
            for item in validation.candidates
            if item.status is ValidationStatus.VALID
        }

        records: list[ConsolidationRecord] = []
        for group in deduplication.groups:
            committed: list[Fact] = []
            skipped: list[Fact] = []
            sources: set[str] = set()

            if group.contradictory:
                for candidate in group.candidates:
                    skipped.append(candidate.fact)
                records.append(
                    ConsolidationRecord(
                        group.key,
                        (),
                        tuple(skipped),
                        tuple(sorted({fact.provenance for fact in skipped})),
                        True,
                    )
                )
                continue

            for candidate in group.candidates:
                fact = candidate.fact
                polarity_key = (*group.key, fact.negated)
                sources.add(fact.provenance)

                if polarity_key not in valid_keys:
                    skipped.append(fact)
                    continue

                if fact in self.engine.graph.facts():
                    skipped.append(fact)
                    continue

                self.engine.graph.add_fact(fact)
                committed.append(fact)

            records.append(
                ConsolidationRecord(
                    group.key,
                    tuple(committed),
                    tuple(skipped),
                    tuple(sorted(sources)),
                    False,
                )
            )

        return ConsolidationReport(tuple(records))


__all__ = ["ConsolidationRecord", "ConsolidationReport", "KnowledgeConsolidator"]

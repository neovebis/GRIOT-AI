from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from griot_engine import Fact
from griot_extraction import ExtractionCandidate


@dataclass(frozen=True, slots=True)
class DeduplicationGroup:
    key: tuple[str, str, str]
    candidates: tuple[ExtractionCandidate, ...]

    @property
    def representative(self) -> ExtractionCandidate:
        return max(
            self.candidates,
            key=lambda candidate: (
                candidate.extraction_confidence,
                candidate.fact.provenance,
                candidate.fact.evidence or "",
            ),
        )

    @property
    def source_count(self) -> int:
        return len({
            candidate.fact.provenance
            for candidate in self.candidates
        })

    @property
    def contradictory(self) -> bool:
        polarities = {candidate.fact.negated for candidate in self.candidates}
        return len(polarities) > 1


@dataclass(frozen=True, slots=True)
class DeduplicationReport:
    groups: tuple[DeduplicationGroup, ...]

    @property
    def unique_candidates(self) -> tuple[ExtractionCandidate, ...]:
        return tuple(group.representative for group in self.groups if not group.contradictory)

    @property
    def duplicates_removed(self) -> int:
        removed = 0
        for group in self.groups:
            by_polarity = {
                polarity: sum(candidate.fact.negated == polarity for candidate in group.candidates)
                for polarity in (False, True)
            }
            removed += sum(max(0, count - 1) for count in by_polarity.values())
        return removed

    @property
    def conflict_groups(self) -> tuple[DeduplicationGroup, ...]:
        return tuple(group for group in self.groups if group.contradictory)


class SemanticDeduplicator:
    """Group semantically identical facts while preserving provenance and polarity."""

    @staticmethod
    def key(fact: Fact) -> tuple[str, str, str]:
        return (fact.subject, fact.relation, fact.object)

    def deduplicate(
        self,
        candidates: Iterable[ExtractionCandidate],
    ) -> DeduplicationReport:
        grouped: dict[tuple[str, str, str], list[ExtractionCandidate]] = {}
        for candidate in candidates:
            grouped.setdefault(self.key(candidate.fact), []).append(candidate)

        groups = tuple(
            DeduplicationGroup(
                key,
                tuple(
                    sorted(
                        items,
                        key=lambda candidate: (
                            -candidate.extraction_confidence,
                            candidate.fact.provenance,
                            candidate.fact.evidence or "",
                        ),
                    )
                ),
            )
            for key, items in sorted(grouped.items())
        )
        return DeduplicationReport(groups)


__all__ = ["DeduplicationGroup", "DeduplicationReport", "SemanticDeduplicator"]

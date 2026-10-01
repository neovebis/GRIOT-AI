from __future__ import annotations

from dataclasses import dataclass
import math

from griot_engine import Fact
from griot_extraction import ExtractionBatch, ExtractionCandidate
from griot_gir import GIR_RELATION_FAMILIES


class ValidationStatus:
    VALID = "valid"
    DUPLICATE = "duplicate"
    CONFLICT = "conflict"
    INVALID = "invalid"


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    code: str
    message: str


@dataclass(frozen=True, slots=True)
class ValidatedCandidate:
    candidate: ExtractionCandidate
    status: str
    issues: tuple[ValidationIssue, ...]


@dataclass(frozen=True, slots=True)
class ValidationReport:
    source_text: str
    candidates: tuple[ValidatedCandidate, ...]

    @property
    def valid(self) -> tuple[ValidatedCandidate, ...]:
        return tuple(item for item in self.candidates if item.status == ValidationStatus.VALID)

    @property
    def rejected(self) -> tuple[ValidatedCandidate, ...]:
        return tuple(item for item in self.candidates if item.status != ValidationStatus.VALID)

    @property
    def can_commit(self) -> bool:
        return bool(self.valid)

    @property
    def statuses(self) -> tuple[str, ...]:
        return tuple(item.status for item in self.candidates)


class KnowledgeValidator:
    """Validate extracted facts without committing anything to durable memory."""

    def __init__(self, engine: object) -> None:
        self.engine = engine

    def validate(self, batch: ExtractionBatch) -> ValidationReport:
        if not isinstance(batch, ExtractionBatch):
            raise TypeError("batch must be an ExtractionBatch")

        output: list[ValidatedCandidate] = []
        for candidate in batch.candidates:
            fact = candidate.fact
            issues: list[ValidationIssue] = []

            if len(fact.subject) != 1 or len(fact.object) != 1:
                issues.append(
                    ValidationIssue(
                        "quid-reference-invalid",
                        "fact subject/object must reference one Unicode QUID symbol each",
                    )
                )

            if fact.relation not in GIR_RELATION_FAMILIES:
                issues.append(
                    ValidationIssue(
                        "relation-unknown",
                        f"relation {fact.relation!r} is not in the current GIR relation family map",
                    )
                )

            if not math.isfinite(float(fact.confidence)) or not 0.0 <= float(fact.confidence) <= 1.0:
                issues.append(
                    ValidationIssue(
                        "confidence-invalid",
                        "fact confidence must be finite and in 0..1",
                    )
                )

            if candidate.gir_fingerprint != batch.gir.fingerprint():
                issues.append(
                    ValidationIssue(
                        "gir-mismatch",
                        "candidate does not belong to the supplied GIR",
                    )
                )

            direct = self._exact_facts(fact)
            if any(existing == fact for existing in direct):
                output.append(
                    ValidatedCandidate(
                        candidate,
                        ValidationStatus.DUPLICATE,
                        (ValidationIssue("duplicate", "fact already exists with identical provenance"),),
                    )
                )
                continue

            opposite = [existing for existing in direct if existing.negated != fact.negated]
            if opposite:
                issues.append(
                    ValidationIssue(
                        "contradiction",
                        "opposite-polarity fact already exists in durable memory",
                    )
                )

            if issues:
                status = (
                    ValidationStatus.CONFLICT
                    if any(issue.code == "contradiction" for issue in issues)
                    else ValidationStatus.INVALID
                )
            else:
                status = ValidationStatus.VALID

            output.append(ValidatedCandidate(candidate, status, tuple(issues)))

        return ValidationReport(batch.text, tuple(output))

    def _exact_facts(self, fact: Fact) -> tuple[Fact, ...]:
        graph = getattr(self.engine, "graph", None)
        if graph is None or not hasattr(graph, "facts"):
            return ()
        return tuple(
            existing
            for existing in graph.facts()
            if existing.subject == fact.subject
            and existing.relation == fact.relation
            and existing.object == fact.object
        )


__all__ = [
    "KnowledgeValidator",
    "ValidatedCandidate",
    "ValidationIssue",
    "ValidationReport",
    "ValidationStatus",
]

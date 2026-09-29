from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable

from griot_reasoning_v040 import ReasoningResult, TruthStatus


@dataclass(frozen=True, slots=True)
class ProvenanceRecord:
    source: str
    kind: str
    relation: str
    subject: str
    object: str
    confidence: float
    rule: str


@dataclass(frozen=True, slots=True)
class ProvenanceTrace:
    records: tuple[ProvenanceRecord, ...]

    def __post_init__(self) -> None:
        ordered = sorted(
            self.records,
            key=lambda r: (
                r.source,
                r.kind,
                r.subject,
                r.relation,
                r.object,
                r.rule,
                -r.confidence,
            ),
        )
        deduped: list[ProvenanceRecord] = []
        seen: set[tuple[object, ...]] = set()
        for record in ordered:
            if not record.source.strip():
                raise ValueError("provenance source must be non-empty")
            if not 0.0 <= record.confidence <= 1.0:
                raise ValueError("provenance confidence must be in 0..1")
            key = (
                record.source,
                record.kind,
                record.relation,
                record.subject,
                record.object,
                record.confidence,
                record.rule,
            )
            if key not in seen:
                seen.add(key)
                deduped.append(record)
        object.__setattr__(self, "records", tuple(deduped))

    @property
    def sources(self) -> tuple[str, ...]:
        return tuple(sorted({record.source for record in self.records}))

    @property
    def source_diversity(self) -> int:
        return len(self.sources)

    @property
    def max_confidence(self) -> float:
        return max((record.confidence for record in self.records), default=0.0)

    @property
    def depth(self) -> int:
        return sum(1 for record in self.records if record.kind == "inference")


class EpistemicStatus(str, Enum):
    SUPPORTED = "supported"
    REFUTED = "refuted"
    CONFLICT = "conflict"
    UNKNOWN = "unknown"


@dataclass(frozen=True, slots=True)
class Assessment:
    query: str
    status: EpistemicStatus
    confidence: float
    source_diversity: int
    proof_depth: int
    answer: bool | None
    evidence_count: int
    supporting_claims: int
    refuting_claims: int
    conflicted_claims: int
    unknown_claims: int
    provenance: ProvenanceTrace
    caveats: tuple[str, ...]

    @property
    def abstained(self) -> bool:
        return self.answer is None


class EpistemicStateEngine:
    """Converts a reasoning result into an explicit epistemic state."""

    def assess(self, result: ReasoningResult, query: str = "") -> Assessment:
        result_status = EpistemicStatus(result.status.value)
        if result_status is EpistemicStatus.SUPPORTED:
            answer: bool | None = True
        elif result_status is EpistemicStatus.REFUTED:
            answer = False
        else:
            answer = None

        records = [
            ProvenanceRecord(
                source=step.provenance or "unknown",
                kind="direct" if step.rule == "direct" else "inference",
                relation=step.relation,
                subject=step.subject,
                object=step.object,
                confidence=float(step.confidence),
                rule=step.rule,
            )
            for step in (*result.proofs, *result.causes)
        ]
        provenance = ProvenanceTrace(tuple(records))

        supporting = sum(claim.status is TruthStatus.SUPPORTED for claim in result.claims)
        refuting = sum(claim.status is TruthStatus.REFUTED for claim in result.claims)
        conflicted = sum(claim.status is TruthStatus.CONFLICT for claim in result.claims)
        unknown = sum(claim.status is TruthStatus.UNKNOWN for claim in result.claims)

        caveats: list[str] = []
        if result_status is EpistemicStatus.CONFLICT:
            caveats.append("conflicting evidence is present")
        if result_status is EpistemicStatus.UNKNOWN:
            caveats.append("no supporting or refuting evidence was established")
        if provenance.source_diversity <= 1 and provenance.records:
            caveats.append("evidence has low source diversity")
        if provenance.depth > 0:
            caveats.append("conclusion includes inferred evidence")

        return Assessment(
            query=query,
            status=result_status,
            confidence=float(result.confidence),
            source_diversity=provenance.source_diversity,
            proof_depth=provenance.depth,
            answer=answer,
            evidence_count=len(result.proofs),
            supporting_claims=supporting,
            refuting_claims=refuting,
            conflicted_claims=conflicted,
            unknown_claims=unknown,
            provenance=provenance,
            caveats=tuple(caveats),
        )


# Compatibility spelling expected by older gate code.
EpistemicAssessment = Assessment


__all__ = [
    "Assessment",
    "EpistemicAssessment",
    "EpistemicStateEngine",
    "EpistemicStatus",
    "ProvenanceRecord",
    "ProvenanceTrace",
]

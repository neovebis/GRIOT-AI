from __future__ import annotations

"""
GRIOT Epistemic Gate v1.2.0

Turns an epistemic Assessment into an explicit answer/abstain decision.

The gate is intentionally conservative:
- UNKNOWN never becomes an answer.
- CONFLICT never becomes an answer.
- low confidence or insufficient independent sources cause abstention.
- inferred results can be restricted by maximum proof depth.
"""

from dataclasses import dataclass
from enum import Enum

from griot_cognition_v100 import Assessment, EpistemicStatus


class GateDecision(str, Enum):
    ANSWER = "answer"
    ABSTAIN = "abstain"


class AbstentionReason(str, Enum):
    NONE = "none"
    UNKNOWN = "unknown"
    CONFLICT = "conflict"
    LOW_CONFIDENCE = "low_confidence"
    INSUFFICIENT_SOURCES = "insufficient_sources"
    EXCESSIVE_PROOF_DEPTH = "excessive_proof_depth"


@dataclass(frozen=True, slots=True)
class GatePolicy:
    min_confidence: float = 0.78
    min_source_diversity: int = 1
    max_proof_depth: int = 4
    allow_refuted: bool = True

    def __post_init__(self) -> None:
        if not 0.0 <= self.min_confidence <= 1.0:
            raise ValueError("min_confidence must be between 0 and 1")
        if self.min_source_diversity < 0:
            raise ValueError("min_source_diversity must be >= 0")
        if self.max_proof_depth < 0:
            raise ValueError("max_proof_depth must be >= 0")


@dataclass(frozen=True, slots=True)
class GatedDecision:
    decision: GateDecision
    reason: AbstentionReason
    status: EpistemicStatus
    confidence: float
    answer: bool | None
    explanation: str


class EpistemicGate:
    """Final deterministic guard before an epistemic answer is emitted."""

    def __init__(self, policy: GatePolicy | None = None) -> None:
        self.policy = policy or GatePolicy()

    def evaluate(self, assessment: Assessment) -> GatedDecision:
        if assessment.status is EpistemicStatus.UNKNOWN:
            return GatedDecision(
                GateDecision.ABSTAIN,
                AbstentionReason.UNKNOWN,
                assessment.status,
                assessment.confidence,
                None,
                "no supported or refuting evidence crossed the epistemic threshold",
            )

        if assessment.status is EpistemicStatus.CONFLICT:
            return GatedDecision(
                GateDecision.ABSTAIN,
                AbstentionReason.CONFLICT,
                assessment.status,
                assessment.confidence,
                None,
                "contradictory evidence requires resolution before answering",
            )

        if assessment.confidence < self.policy.min_confidence:
            return GatedDecision(
                GateDecision.ABSTAIN,
                AbstentionReason.LOW_CONFIDENCE,
                assessment.status,
                assessment.confidence,
                None,
                "confidence is below the answer gate threshold",
            )

        if (
            assessment.source_diversity < self.policy.min_source_diversity
            and self.policy.min_source_diversity > 0
        ):
            return GatedDecision(
                GateDecision.ABSTAIN,
                AbstentionReason.INSUFFICIENT_SOURCES,
                assessment.status,
                assessment.confidence,
                None,
                "independent source diversity is below the answer gate threshold",
            )

        if assessment.proof_depth > self.policy.max_proof_depth:
            return GatedDecision(
                GateDecision.ABSTAIN,
                AbstentionReason.EXCESSIVE_PROOF_DEPTH,
                assessment.status,
                assessment.confidence,
                None,
                "proof depth exceeds the answer gate limit",
            )

        if assessment.status is EpistemicStatus.REFUTED and not self.policy.allow_refuted:
            return GatedDecision(
                GateDecision.ABSTAIN,
                AbstentionReason.LOW_CONFIDENCE,
                assessment.status,
                assessment.confidence,
                None,
                "policy forbids emitting refuted answers",
            )

        answer = assessment.status is EpistemicStatus.SUPPORTED
        return GatedDecision(
            GateDecision.ANSWER,
            AbstentionReason.NONE,
            assessment.status,
            assessment.confidence,
            answer,
            "epistemic status and gate requirements are satisfied",
        )


__all__ = [
    "GateDecision",
    "AbstentionReason",
    "GatePolicy",
    "GatedDecision",
    "EpistemicGate",
]

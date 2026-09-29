from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from griot_cognition_v100 import Assessment, EpistemicStatus
from griot_engine import Fact, Inference
from griot_gir import GIR
from griot_reasoning_v040 import ReasoningResult, TruthStatus


class VerificationStatus(str, Enum):
    VERIFIED = "verified"
    REJECTED = "rejected"


@dataclass(frozen=True, slots=True)
class VerificationIssue:
    code: str
    message: str
    severity: str = "error"


@dataclass(frozen=True, slots=True)
class VerificationReport:
    status: VerificationStatus
    issues: tuple[VerificationIssue, ...]
    proof_count: int
    evidence_count: int
    deterministic: bool

    @property
    def ok(self) -> bool:
        return self.status is VerificationStatus.VERIFIED


class VerificationEngine:
    """Audit a reasoning result before it becomes a final public answer."""

    def verify(
        self,
        gir: GIR,
        result: ReasoningResult,
        assessment: Assessment,
    ) -> VerificationReport:
        issues: list[VerificationIssue] = []
        deterministic = True

        try:
            gir.validate()
        except (TypeError, ValueError) as exc:
            issues.append(VerificationIssue("gir-invalid", str(exc)))

        if not 0.0 <= float(result.confidence) <= 1.0:
            issues.append(
                VerificationIssue("confidence-invalid", "reasoning confidence is outside 0..1")
            )

        expected_status = TruthStatus(result.status.value)
        if assessment.status.value != expected_status.value:
            issues.append(
                VerificationIssue(
                    "epistemic-mismatch",
                    "epistemic assessment status does not match reasoning status",
                )
            )

        if expected_status is TruthStatus.SUPPORTED and assessment.answer is not True:
            issues.append(
                VerificationIssue(
                    "supported-without-true-answer",
                    "supported reasoning must expose answer=True",
                )
            )
        if expected_status is TruthStatus.REFUTED and assessment.answer is not False:
            issues.append(
                VerificationIssue(
                    "refuted-without-false-answer",
                    "refuted reasoning must expose answer=False",
                )
            )
        if expected_status in {TruthStatus.UNKNOWN, TruthStatus.CONFLICT} and assessment.answer is not None:
            issues.append(
                VerificationIssue(
                    "non-answer-leak",
                    "unknown/conflict reasoning must abstain",
                )
            )

        graph = _graph_from_result(result)
        direct_facts = {
            (
                fact.subject,
                fact.relation,
                fact.object,
                fact.negated,
                fact.provenance,
                fact.evidence,
                fact.confidence,
            )
            for fact in graph
        }

        for proof in result.proofs:
            if proof.rule == "direct":
                if not any(
                    f.subject == proof.subject
                    and f.relation == proof.relation
                    and f.object == proof.object
                    and f.provenance == proof.provenance
                    and abs(float(f.confidence) - float(proof.confidence)) < 1e-9
                    for f in graph
                ):
                    issues.append(
                        VerificationIssue(
                            "proof-not-grounded",
                            f"direct proof {proof.subject} {proof.relation} {proof.object} is not present in durable evidence",
                        )
                    )
            elif not proof.provenance:
                issues.append(
                    VerificationIssue(
                        "proof-without-provenance",
                        f"derived proof {proof.subject} {proof.relation} {proof.object} has no provenance",
                    )
                )

        if result.status is TruthStatus.CONFLICT and not any(
            getattr(item, "negated", False) is False for item in graph
        ):
            issues.append(
                VerificationIssue(
                    "conflict-without-positive-evidence",
                    "conflict result has no positive evidence in durable graph",
                )
            )

        # Verify that the same GIR yields the same logical status/confidence.
        # Exact proof ordering is intentionally not required here.
        try:
            replay_semantic = getattr(result, "_replay_semantic", None)
            replay = None
            if replay_semantic is not None:
                replay = replay_semantic.reason_meaning("", gir)
            if replay is not None:
                deterministic = (
                    replay.status is result.status
                    and abs(replay.confidence - result.confidence) < 1e-9
                )
        except Exception:
            deterministic = False

        if not deterministic:
            issues.append(
                VerificationIssue(
                    "nondeterministic-replay",
                    "reasoning replay did not reproduce the same status/confidence",
                )
            )

        if not assessment.provenance.records and result.status in {
            TruthStatus.SUPPORTED,
            TruthStatus.REFUTED,
        }:
            issues.append(
                VerificationIssue(
                    "verified-without-provenance",
                    "supported/refuted result has no provenance records",
                )
            )

        status = (
            VerificationStatus.REJECTED
            if issues
            else VerificationStatus.VERIFIED
        )
        return VerificationReport(
            status,
            tuple(issues),
            len(result.proofs),
            len(result.proofs),
            deterministic,
        )


def _graph_from_result(result: ReasoningResult) -> tuple[Fact, ...]:
    semantic = getattr(result, "_semantic_engine", None)
    if semantic is None:
        return ()
    return tuple(semantic.graph.facts())


__all__ = [
    "VerificationEngine",
    "VerificationIssue",
    "VerificationReport",
    "VerificationStatus",
]

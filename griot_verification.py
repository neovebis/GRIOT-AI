from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from griot_cognition_v100 import Assessment, EpistemicStatus
from griot_engine import Fact, Inference
from griot_gir import GIR
from griot_reasoning_v040 import ReasoningEngine, ReasoningResult, TruthStatus
from griot_reasoning_invariants import ReasoningInvariantEngine


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
        *,
        reasoning_engine: ReasoningEngine | None = None,
    ) -> VerificationReport:
        issues: list[VerificationIssue] = []

        try:
            gir.validate()
        except (TypeError, ValueError) as exc:
            issues.append(VerificationIssue("gir-invalid", str(exc)))

        if not 0.0 <= float(result.confidence) <= 1.0:
            issues.append(
                VerificationIssue(
                    "confidence-invalid",
                    "reasoning confidence is outside 0..1",
                )
            )

        if assessment.status.value != result.status.value:
            issues.append(
                VerificationIssue(
                    "epistemic-mismatch",
                    "epistemic assessment status does not match reasoning status",
                )
            )

        if result.status is TruthStatus.SUPPORTED and assessment.answer is not True:
            issues.append(
                VerificationIssue(
                    "supported-without-true-answer",
                    "supported reasoning must expose answer=True",
                )
            )
        elif result.status is TruthStatus.REFUTED and assessment.answer is not False:
            issues.append(
                VerificationIssue(
                    "refuted-without-false-answer",
                    "refuted reasoning must expose answer=False",
                )
            )
        elif result.status in {TruthStatus.UNKNOWN, TruthStatus.CONFLICT} and assessment.answer is not None:
            issues.append(
                VerificationIssue(
                    "non-answer-leak",
                    "unknown/conflict reasoning must abstain",
                )
            )

        direct_facts: tuple[Fact, ...] = ()
        if reasoning_engine is not None:
            direct_facts = tuple(reasoning_engine.semantic.engine.graph.facts())

        for proof in result.proofs:
            if proof.rule == "direct":
                grounded = any(
                    fact.subject == proof.subject
                    and fact.relation == proof.relation
                    and fact.object == proof.object
                    and fact.provenance == proof.provenance
                    and abs(float(fact.confidence) - float(proof.confidence)) < 1e-9
                    for fact in direct_facts
                )
                if not grounded:
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

        if result.status is TruthStatus.CONFLICT and result.claims:
            for claim in result.claims:
                if claim.status is TruthStatus.CONFLICT:
                    positive = False
                    negative = False
                    for fact in direct_facts:
                        if (
                            fact.subject == claim.subject
                            and fact.relation == claim.relation
                            and fact.object == claim.object
                        ):
                            if fact.negated:
                                negative = True
                            else:
                                positive = True
                    if not (positive and negative):
                        issues.append(
                            VerificationIssue(
                                "conflict-not-grounded",
                                f"conflict for {claim.subject} {claim.relation} {claim.object} lacks both polarities in durable evidence",
                            )
                        )

        deterministic = True
        if reasoning_engine is not None:
            try:
                replay = reasoning_engine.reason_meaning(
                    "",
                    gir,
                    result.context,
                )
                deterministic = (
                    replay.status is result.status
                    and abs(float(replay.confidence) - float(result.confidence)) < 1e-9
                )
            except Exception as exc:
                deterministic = False
                issues.append(
                    VerificationIssue(
                        "replay-error",
                        f"reasoning replay failed: {exc}",
                    )
                )

        if not deterministic:
            issues.append(
                VerificationIssue(
                    "nondeterministic-replay",
                    "reasoning replay did not reproduce the same status/confidence",
                )
            )

        invariant_report = ReasoningInvariantEngine().check(
            result,
            durable_facts=direct_facts,
        )
        for issue in invariant_report.issues:
            issues.append(
                VerificationIssue(
                    f"invariant:{issue.code}",
                    issue.message,
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

        status = VerificationStatus.REJECTED if issues else VerificationStatus.VERIFIED
        return VerificationReport(
            status,
            tuple(issues),
            len(result.proofs),
            len(direct_facts),
            deterministic,
        )


__all__ = [
    "VerificationEngine",
    "VerificationIssue",
    "VerificationReport",
    "VerificationStatus",
]
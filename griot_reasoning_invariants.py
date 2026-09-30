from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from griot_engine import Fact, Inference
from griot_gir import GIR
from griot_reasoning_v040 import ReasoningResult, TruthStatus


@dataclass(frozen=True, slots=True)
class InvariantIssue:
    code: str
    message: str


@dataclass(frozen=True, slots=True)
class InvariantReport:
    ok: bool
    issues: tuple[InvariantIssue, ...]

    @property
    def codes(self) -> tuple[str, ...]:
        return tuple(issue.code for issue in self.issues)


class ReasoningInvariantEngine:
    """Validate semantic/reasoning invariants that must hold across equivalent runs."""

    def check(
        self,
        result: ReasoningResult,
        *,
        durable_facts: Iterable[Fact] = (),
    ) -> InvariantReport:
        issues: list[InvariantIssue] = []
        facts = tuple(durable_facts)
        meaning = result.meaning

        try:
            meaning.validate()
        except (TypeError, ValueError) as exc:
            issues.append(InvariantIssue("meaning-invalid", str(exc)))

        node_ids = {node.node_id for node in meaning.nodes}
        quids = [node.quid for node in meaning.nodes]
        if any(len(quid) != 1 for quid in quids):
            issues.append(InvariantIssue("non-atomic-quid", "every GIR node must retain one-codepoint QUID identity"))
        if len(quids) != len(set(quids)):
            issues.append(InvariantIssue("duplicate-quid", "GIR contains duplicate QUID identities"))

        for claim in result.claims:
            if claim.status is TruthStatus.SUPPORTED and not any(
                bool(getattr(item, "negated", False)) == claim.requested_negated
                for item in claim.evidence
            ):
                issues.append(InvariantIssue(
                    "supported-without-polarity-evidence",
                    f"supported claim {claim.subject} {claim.relation} {claim.object} lacks matching-polarity evidence",
                ))
            if claim.status is TruthStatus.REFUTED and not any(
                bool(getattr(item, "negated", False)) != claim.requested_negated
                for item in claim.evidence
            ):
                issues.append(InvariantIssue(
                    "refuted-without-opposite-evidence",
                    f"refuted claim {claim.subject} {claim.relation} {claim.object} lacks opposite-polarity evidence",
                ))
            if claim.status is TruthStatus.CONFLICT:
                polarities = {
                    bool(getattr(item, "negated", False))
                    for item in claim.evidence
                }
                if len(polarities) < 2:
                    issues.append(InvariantIssue(
                        "conflict-without-two-polarities",
                        f"conflict for {claim.subject} {claim.relation} {claim.object} is not grounded in both polarities",
                    ))
            if claim.status is TruthStatus.UNKNOWN and claim.evidence:
                issues.append(InvariantIssue(
                    "unknown-with-evidence",
                    f"unknown claim {claim.subject} {claim.relation} {claim.object} unexpectedly has evidence",
                ))

        expected_overall = self._expected_overall(result.claims)
        if result.claims and result.status is not expected_overall:
            issues.append(InvariantIssue(
                "overall-status-mismatch",
                f"overall status {result.status.value} does not match claim statuses ({expected_overall.value})",
            ))

        proof_keys = [
            (
                proof.relation,
                proof.subject,
                proof.object,
                round(float(proof.confidence), 12),
                proof.rule,
                proof.provenance,
            )
            for proof in result.proofs
        ]
        if len(proof_keys) != len(set(proof_keys)):
            issues.append(InvariantIssue("duplicate-proof", "reasoning proof contains duplicate steps"))

        for proof in result.proofs:
            matching_fact = any(
                fact.subject == proof.subject
                and fact.relation == proof.relation
                and fact.object == proof.object
                and abs(float(fact.confidence) - float(proof.confidence)) < 1e-9
                for fact in facts
            )
            if proof.rule == "direct" and not matching_fact and facts:
                issues.append(InvariantIssue(
                    "direct-proof-not-in-durable-set",
                    f"direct proof {proof.subject} {proof.relation} {proof.object} is absent from durable facts",
                ))
            if proof.subject not in {node.quid for node in meaning.nodes} or proof.object not in {node.quid for node in meaning.nodes}:
                issues.append(InvariantIssue(
                    "proof-outside-meaning",
                    f"proof {proof.subject} {proof.relation} {proof.object} references a QUID absent from GIR",
                ))

        if result.status in {TruthStatus.UNKNOWN} and result.proofs:
            issues.append(InvariantIssue("unknown-has-proof", "unknown reasoning must not expose a proof"))

        return InvariantReport(not issues, tuple(issues))

    @staticmethod
    def _expected_overall(claims) -> TruthStatus:
        statuses = {claim.status for claim in claims}
        if TruthStatus.CONFLICT in statuses:
            return TruthStatus.CONFLICT
        if TruthStatus.REFUTED in statuses:
            return TruthStatus.REFUTED
        if statuses and all(status is TruthStatus.SUPPORTED for status in statuses):
            return TruthStatus.SUPPORTED
        return TruthStatus.UNKNOWN


__all__ = ["InvariantIssue", "InvariantReport", "ReasoningInvariantEngine"]

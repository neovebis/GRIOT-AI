from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable

from griot_context import ContextView
from griot_gir import GIR
from griot_semantic_ir import SemanticGRIOT

try:
    from griot_engine import Fact, Inference
except ImportError:
    from griot.types import Fact, Inference


class TruthStatus(str, Enum):
    SUPPORTED = "supported"
    REFUTED = "refuted"
    CONFLICT = "conflict"
    UNKNOWN = "unknown"


@dataclass(frozen=True, slots=True)
class ProofStep:
    relation: str
    subject: str
    object: str
    confidence: float
    rule: str
    provenance: str


@dataclass(frozen=True, slots=True)
class ClaimReasoning:
    relation: str
    subject: str
    object: str
    requested_negated: bool
    status: TruthStatus
    confidence: float
    proofs: tuple[ProofStep, ...]
    causes: tuple[ProofStep, ...] = ()


@dataclass(frozen=True, slots=True)
class ReasoningResult:
    status: TruthStatus
    confidence: float
    meaning: GIR
    proofs: tuple[ProofStep, ...]
    causes: tuple[ProofStep, ...] = ()
    claims: tuple[ClaimReasoning, ...] = ()
    context: ContextView | None = None


class ReasoningEngine:
    """Unified proof-oriented reasoning engine over GIR and graph memory.

    All semantic claims in a GIR are evaluated. Durable graph evidence is the
    only truth source at this stage; transient context is attached for later
    reasoning stages but cannot itself establish truth.
    """

    QUERY_RELATIONS = {
        "is_a", "part_of", "member_of", "has", "causes", "before", "after", "located_in",
        "attacks", "eats", "sees", "uses", "builds", "creates", "helps", "hurts",
        "wants", "needs", "knows", "believes",
    }

    def __init__(self, semantic: SemanticGRIOT | None = None) -> None:
        self.semantic = semantic or SemanticGRIOT()

    def reason(self, text: str, context: ContextView | None = None) -> ReasoningResult:
        meaning = self.semantic.understand(text)
        if context is None:
            context = self.semantic.engine.context.view(meaning)
        return self.reason_meaning(text, meaning, context)

    def reason_meaning(
        self,
        text: str,
        meaning: GIR,
        context: ContextView | None = None,
    ) -> ReasoningResult:
        """Evaluate every query relation in a validated GIR.

        Query negation is interpreted as a requested polarity: a negative graph
        fact supports a negative query, while a positive graph fact refutes it.
        """

        del text
        meaning.validate()

        candidates = [edge for edge in meaning.edges if edge.relation in self.QUERY_RELATIONS]
        if not candidates:
            return ReasoningResult(
                TruthStatus.UNKNOWN,
                meaning.frame.confidence,
                meaning,
                (),
                context=context,
            )

        nodes = {node.node_id: node for node in meaning.nodes}
        claims: list[ClaimReasoning] = []

        for edge in candidates:
            source_node = nodes.get(edge.source)
            target_node = nodes.get(edge.target)
            if source_node is None or target_node is None:
                continue

            subject = source_node.quid
            object_ = target_node.quid
            evidence = self.semantic.engine.graph.query(subject, edge.relation, object_)
            support = [
                item for item in evidence
                if bool(getattr(item, "negated", False)) == edge.negated
            ]
            contrary = [
                item for item in evidence
                if bool(getattr(item, "negated", False)) != edge.negated
            ]

            support_proofs = self._proofs(support)
            contrary_proofs = self._proofs(contrary)
            if support and contrary:
                status = TruthStatus.CONFLICT
                claim_confidence = max(self._confidence(support + contrary))
                proofs = support_proofs + contrary_proofs
            elif support:
                status = TruthStatus.SUPPORTED
                claim_confidence = max(self._confidence(support))
                proofs = support_proofs
            elif contrary:
                status = TruthStatus.REFUTED
                claim_confidence = max(self._confidence(contrary))
                proofs = contrary_proofs
            else:
                status = TruthStatus.UNKNOWN
                claim_confidence = 0.0
                proofs = ()

            claims.append(
                ClaimReasoning(
                    relation=edge.relation,
                    subject=subject,
                    object=object_,
                    requested_negated=edge.negated,
                    status=status,
                    confidence=claim_confidence,
                    proofs=proofs,
                    causes=self._causes_for(object_),
                )
            )

        if not claims:
            return ReasoningResult(
                TruthStatus.UNKNOWN,
                0.0,
                meaning,
                (),
                context=context,
            )

        statuses = {claim.status for claim in claims}
        if TruthStatus.CONFLICT in statuses:
            overall = TruthStatus.CONFLICT
            confidence = max(claim.confidence for claim in claims)
        elif TruthStatus.REFUTED in statuses:
            overall = TruthStatus.REFUTED
            confidence = max(
                claim.confidence for claim in claims
                if claim.status is TruthStatus.REFUTED
            )
        elif all(claim.status is TruthStatus.SUPPORTED for claim in claims):
            overall = TruthStatus.SUPPORTED
            confidence = min(claim.confidence for claim in claims)
        else:
            overall = TruthStatus.UNKNOWN
            confidence = 0.0

        proofs = self._dedupe_steps(step for claim in claims for step in claim.proofs)
        causes = self._dedupe_steps(step for claim in claims for step in claim.causes)
        return ReasoningResult(
            overall,
            confidence,
            meaning,
            proofs,
            causes,
            tuple(claims),
            context,
        )

    def why(self, target: str) -> tuple[ProofStep, ...]:
        q = self.semantic.engine.quids.get(target)
        return tuple(self._causes_for(q.symbol)) if q else ()

    def _causes_for(self, target_symbol: str) -> tuple[ProofStep, ...]:
        facts = [
            f for f in self.semantic.engine.graph.facts()
            if f.relation == "causes" and f.object == target_symbol
        ]
        facts.sort(key=lambda f: (-f.confidence, f.subject, f.object))
        return self._proofs(facts)

    @staticmethod
    def _confidence(items: Iterable[Fact | Inference]) -> list[float]:
        return [float(item.confidence) for item in items]

    @staticmethod
    def _proofs(items: Iterable[Fact | Inference]) -> tuple[ProofStep, ...]:
        out: list[ProofStep] = []
        for item in items:
            if isinstance(item, Inference):
                fact = item.fact
                out.append(
                    ProofStep(
                        fact.relation,
                        fact.subject,
                        fact.object,
                        item.confidence,
                        item.rule,
                        fact.provenance,
                    )
                )
                for support in item.support:
                    out.append(
                        ProofStep(
                            support.relation,
                            support.subject,
                            support.object,
                            support.confidence,
                            "support",
                            support.provenance,
                        )
                    )
            else:
                out.append(
                    ProofStep(
                        item.relation,
                        item.subject,
                        item.object,
                        item.confidence,
                        "direct",
                        item.provenance,
                    )
                )
        return tuple(out)

    @staticmethod
    def _dedupe_steps(items: Iterable[ProofStep]) -> tuple[ProofStep, ...]:
        seen: set[tuple[object, ...]] = set()
        out: list[ProofStep] = []
        for step in items:
            key = (
                step.relation,
                step.subject,
                step.object,
                step.confidence,
                step.rule,
                step.provenance,
            )
            if key not in seen:
                seen.add(key)
                out.append(step)
        return tuple(out)


class ReasoningController(ReasoningEngine):
    """Compatibility facade retaining the pre-A4 controller name."""


__all__ = [
    "ClaimReasoning",
    "ReasoningEngine",
    "ReasoningController",
    "ReasoningResult",
    "ProofStep",
    "TruthStatus",
]

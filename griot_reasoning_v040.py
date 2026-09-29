from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable

from griot_semantic_ir import MeaningRepresentation, SemanticGRIOT
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
class ReasoningResult:
    status: TruthStatus
    confidence: float
    meaning: MeaningRepresentation
    proofs: tuple[ProofStep, ...]
    causes: tuple[ProofStep, ...] = ()


class ReasoningController:
    """Proof-oriented controller over GRIOT semantic IR and graph memory."""

    QUERY_RELATIONS = {
        "is_a", "part_of", "member_of", "has", "causes", "before", "after", "located_in",
        "attacks", "eats", "sees", "uses", "builds", "creates", "helps", "hurts",
        "wants", "needs", "knows", "believes",
    }

    def __init__(self, semantic: SemanticGRIOT | None = None) -> None:
        self.semantic = semantic or SemanticGRIOT()

    def reason(self, text: str) -> ReasoningResult:
        meaning = self.semantic.understand(text)
        return self.reason_meaning(text, meaning)

    def reason_meaning(self, text: str, meaning: MeaningRepresentation) -> ReasoningResult:
        """Reason over an already compiled semantic representation.

        Keeping compilation outside this method lets the public Quid.analisar
        pipeline parse once and share exactly the same IR with the proof layer.
        """
        del text  # retained in the API for tracing compatibility
        candidates = [edge for edge in meaning.edges if edge.relation in self.QUERY_RELATIONS]
        if not candidates:
            return ReasoningResult(TruthStatus.UNKNOWN, meaning.frame.confidence, meaning, ())

        edge = candidates[0]
        nodes = {node.node_id: node for node in meaning.nodes}
        source_node = nodes.get(edge.source)
        target_node = nodes.get(edge.target)
        if source_node is None or target_node is None:
            return ReasoningResult(TruthStatus.UNKNOWN, 0.0, meaning, ())

        subject = source_node.quid
        object_ = target_node.quid
        graph = self.semantic.engine.graph

        evidence = graph.query(subject, edge.relation, object_)
        positive = [item for item in evidence if not getattr(item, "negated", False)]
        negative = [item for item in evidence if getattr(item, "negated", False)]

        proofs = tuple(self._proofs(positive))
        negative_proofs = tuple(self._proofs(negative))

        if positive and negative:
            return ReasoningResult(
                TruthStatus.CONFLICT,
                max(self._confidence(positive + negative)),
                meaning,
                proofs + negative_proofs,
                self._causes_for(object_),
            )
        if positive:
            return ReasoningResult(
                TruthStatus.SUPPORTED,
                max(self._confidence(positive)),
                meaning,
                proofs,
                self._causes_for(object_),
            )
        if negative:
            return ReasoningResult(
                TruthStatus.REFUTED,
                max(self._confidence(negative)),
                meaning,
                negative_proofs,
                self._causes_for(object_),
            )
        return ReasoningResult(
            TruthStatus.UNKNOWN,
            0.0,
            meaning,
            (),
            self._causes_for(object_),
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
        return tuple(self._proofs(facts))

    @staticmethod
    def _confidence(items: Iterable[Fact | Inference]) -> list[float]:
        return [float(item.confidence) for item in items]

    @staticmethod
    def _proofs(items: Iterable[Fact | Inference]) -> list[ProofStep]:
        out: list[ProofStep] = []
        for item in items:
            if isinstance(item, Inference):
                f = item.fact
                out.append(ProofStep(f.relation, f.subject, f.object, item.confidence, item.rule, f.provenance))
                for support in item.support:
                    out.append(ProofStep(support.relation, support.subject, support.object, support.confidence, "support", support.provenance))
            else:
                out.append(ProofStep(item.relation, item.subject, item.object, item.confidence, "direct", item.provenance))
        return out


__all__ = ["TruthStatus", "ProofStep", "ReasoningResult", "ReasoningController"]

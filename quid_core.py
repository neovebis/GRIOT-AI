from __future__ import annotations

from dataclasses import dataclass

from griot_engine import Fact, GRIOT, Inference
from griot_reasoning_v040 import ReasoningController, ReasoningResult, TruthStatus
from griot_semantic_ir import MeaningRepresentation, SemanticGRIOT


@dataclass(frozen=True, slots=True)
class QuidAnalysis:
    """Single integrated result produced by the GRIOT A1 pipeline.

    The semantic representation is compiled once and then passed directly to
    the proof-oriented reasoning controller. The 'gir' field is the current
    executable semantic IR contract; its final wire/storage serialization
    remains a later architectural decision.
    """

    text: str
    gir: MeaningRepresentation
    reasoning: ReasoningResult
    answer: bool | None
    epistemic_status: TruthStatus
    confidence: float
    semantic_facts: tuple[Fact, ...]
    graph_evidence: tuple[Fact | Inference, ...]
    resolved_quids: tuple[str, ...]
    provenance: tuple[str, ...]
    explanation: str

    @property
    def abstained(self) -> bool:
        return self.epistemic_status in {TruthStatus.UNKNOWN, TruthStatus.CONFLICT}


class Quid:
    """Public orchestration facade for one integrated semantic analysis."""

    def __init__(self, engine: GRIOT | None = None) -> None:
        self.engine = engine or GRIOT.create()
        self.semantic = SemanticGRIOT(self.engine)
        self.reasoning = ReasoningController(self.semantic)

    def analisar(self, text: str) -> QuidAnalysis:
        if not isinstance(text, str):
            raise TypeError("text must be a string")
        if not text.strip():
            raise ValueError("text must not be empty")

        # Compile exactly once. The resulting IR is the common contract between
        # semantic parsing, QUID resolution and proof-oriented reasoning.
        gir = self.semantic.understand(text)
        result = self.reasoning.reason_meaning(text, gir)

        answer: bool | None
        if result.status is TruthStatus.SUPPORTED:
            answer = True
        elif result.status is TruthStatus.REFUTED:
            answer = False
        else:
            # UNKNOWN and CONFLICT are deliberately non-answers.
            answer = None

        semantic_facts = gir.facts()

        graph_evidence: tuple[Fact | Inference, ...] = ()
        nodes = {node.node_id: node for node in gir.nodes}
        for edge in gir.edges:
            if edge.relation not in self.reasoning.QUERY_RELATIONS:
                continue
            source = nodes.get(edge.source)
            target = nodes.get(edge.target)
            if source is None or target is None:
                continue
            graph_evidence = tuple(
                self.engine.graph.query(source.quid, edge.relation, target.quid)
            )
            break

        resolved = tuple(dict.fromkeys(node.quid for node in gir.nodes))
        provenance = tuple(
            sorted({step.provenance for step in result.proofs if step.provenance})
        )

        explanation = self._explanation(result)

        return QuidAnalysis(
            text=text,
            gir=gir,
            reasoning=result,
            answer=answer,
            epistemic_status=result.status,
            confidence=result.confidence,
            semantic_facts=semantic_facts,
            graph_evidence=graph_evidence,
            resolved_quids=resolved,
            provenance=provenance,
            explanation=explanation,
        )

    @staticmethod
    def _explanation(result: ReasoningResult) -> str:
        if result.status is TruthStatus.SUPPORTED:
            return "conclusão suportada por evidência/prova registrada"
        if result.status is TruthStatus.REFUTED:
            return "proposição refutada por evidência/prova registrada"
        if result.status is TruthStatus.CONFLICT:
            return "evidência contraditória presente; conclusão suspensa"
        return "sem prova de suporte ou refutação suficiente"


__all__ = ["Quid", "QuidAnalysis"]

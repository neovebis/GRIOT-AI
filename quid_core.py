from __future__ import annotations

from dataclasses import dataclass

from griot_context import ContextView
from griot_engine import Fact, GRIOT, Inference
from griot_gir import GIR
from griot_reasoning_v040 import ReasoningController, ReasoningResult, TruthStatus
from griot_semantic_ir import SemanticGRIOT


@dataclass(frozen=True, slots=True)
class QuidAnalysis:
    """Single integrated result produced by the GRIOT A1 pipeline.

    GIR is now a formal, validated and versioned internal contract shared by
    semantic compilation, QUID resolution and proof-oriented reasoning.
    """

    text: str
    gir: GIR
    reasoning: ReasoningResult
    context: ContextView
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

        gir = self.semantic.understand(text)
        context_view = self.engine.context.view(gir)
        result = self.reasoning.reason_meaning(text, gir)
        self.engine.context.ingest(gir, source="query")

        answer: bool | None
        if result.status is TruthStatus.SUPPORTED:
            answer = True
        elif result.status is TruthStatus.REFUTED:
            answer = False
        else:
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
            sorted(
                {
                    p
                    for p in (
                        (*gir.provenance, *(step.provenance for step in result.proofs))
                    )
                    if p
                }
            )
        )

        explanation = self._explanation(result)

        return QuidAnalysis(
            text=text,
            gir=gir,
            reasoning=result,
            context=context_view,
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

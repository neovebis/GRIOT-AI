from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from griot_advanced_reasoning import AdvancedReasoningResult
from griot_context import ContextView
from griot_discourse import DiscourseState
from griot_gir import GIR
from griot_knowledge_acquisition import AcquisitionReport, KnowledgeSource
from griot_query_planner import QueryExecution, QueryPlan
from griot_reasoning_v040 import ReasoningResult, TruthStatus
from griot_working_graph import WorkingGraphState

if TYPE_CHECKING:
    from quid_core import Quid


@dataclass(frozen=True, slots=True)
class IntegratedReasoningResult:
    """Single result contract for the G1 -> G2 -> G3 runtime path."""

    query: str
    gir: GIR
    context: ContextView
    discourse: DiscourseState
    query_plan: QueryPlan
    query_execution: QueryExecution
    working_graph: WorkingGraphState
    base_reasoning: ReasoningResult
    advanced_reasoning: AdvancedReasoningResult

    @property
    def epistemic_status(self) -> TruthStatus:
        return self.advanced_reasoning.result.status

    @property
    def confidence(self) -> float:
        return float(self.advanced_reasoning.result.confidence)

    @property
    def answer_value(self) -> object | None:
        return self.advanced_reasoning.answer_value

    @property
    def verification_ok(self) -> bool:
        return bool(self.advanced_reasoning.verification.ok)

    @property
    def abstained(self) -> bool:
        return (
            self.epistemic_status in {TruthStatus.UNKNOWN, TruthStatus.CONFLICT}
            or not self.verification_ok
        )

    @property
    def next_operation(self) -> str:
        return self.advanced_reasoning.metacognition.next_operation

    @property
    def resolved_quids(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys(node.quid for node in self.gir.nodes))


class GriotIntegrationPipeline:
    """Canonical runtime orchestrator for the current GRIOT architecture.

    Query path:
        text -> G1 semantic GIR/context -> retrieval/working graph ->
        proof reasoning -> G3 advanced reasoning -> verified result.

    G2 remains the upstream durable-knowledge boundary and can feed the same
    pipeline through acquire_and_run().
    """

    def __init__(self, quid: Quid) -> None:
        self.quid = quid
        self.engine = quid.engine
        self.semantic = quid.semantic
        self.reasoning = quid.reasoning
        self.query_planner = quid.query_planner
        self.advanced_reasoning = quid.advanced_reasoning
        self.knowledge = quid.knowledge

    def run(
        self,
        query: str,
        *,
        decompose: bool = True,
        hypothesis_limit: int = 8,
        max_hops: int = 8,
        context_source: str = "query",
    ) -> IntegratedReasoningResult:
        self._validate_query(query)
        if not isinstance(context_source, str) or not context_source.strip():
            raise ValueError("context_source must be a non-empty string")

        # G1: compile exactly once for the canonical query path.
        gir = self.semantic.understand(query)
        context = self.engine.context.view(gir)
        discourse = self.engine.discourse.observe(
            query,
            gir,
            previous_records=self.engine.context.records(),
        )

        # G1/A7: make retrieval explicit before advanced reasoning.
        query_plan = self.query_planner.plan(gir, context)
        query_execution = self.query_planner.execute(
            query_plan,
            gir,
            context,
        )

        # A4/G3: use the already compiled GIR and context for the main query.
        base_reasoning = self.reasoning.reason_meaning(
            query,
            gir,
            context,
        )
        advanced = self.advanced_reasoning.solve(
            query,
            decompose=decompose,
            hypothesis_limit=hypothesis_limit,
            max_hops=max_hops,
            meaning=gir,
            context=context,
        )

        # Persist only the transient conversational record; truth stays in
        # durable knowledge and is never created by context ingestion.
        self.engine.context.ingest(gir, source=context_source.strip())

        return IntegratedReasoningResult(
            query=query,
            gir=gir,
            context=context,
            discourse=discourse,
            query_plan=query_plan,
            query_execution=query_execution,
            working_graph=query_execution.working_graph,
            base_reasoning=base_reasoning,
            advanced_reasoning=advanced,
        )

    def acquire_and_run(
        self,
        text: str,
        *,
        source: str | KnowledgeSource,
        query: str | None = None,
        document_id: str | None = None,
        auto_commit: bool = True,
        replace: bool = True,
        decompose: bool = True,
        hypothesis_limit: int = 8,
        max_hops: int = 8,
        context_source: str = "acquired-query",
    ) -> tuple[AcquisitionReport, IntegratedReasoningResult]:
        if not isinstance(text, str) or not text.strip():
            raise ValueError("text must not be empty")
        report = self.knowledge.acquire_text(
            text,
            source=source,
            document_id=document_id,
            auto_commit=auto_commit,
            replace=replace,
        )
        target = query if query is not None else text
        return (
            report,
            self.run(
                target,
                decompose=decompose,
                hypothesis_limit=hypothesis_limit,
                max_hops=max_hops,
                context_source=context_source,
            ),
        )

    @staticmethod
    def _validate_query(query: str) -> None:
        if not isinstance(query, str):
            raise TypeError("query must be a string")
        if not query.strip():
            raise ValueError("query must not be empty")


__all__ = ["GriotIntegrationPipeline", "IntegratedReasoningResult"]

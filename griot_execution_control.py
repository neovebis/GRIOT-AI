from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING

from griot_hypothesis_v050 import HypothesisReport
from griot_integration_pipeline import GriotIntegrationPipeline, IntegratedReasoningResult
from griot_reasoning_v040 import TruthStatus
from griot_verification import VerificationEngine, VerificationReport
from griot_causality import CausalAnalysis
from griot_counterfactual import CounterfactualScenario
from griot_selective_retrieval import RetrievalResult

if TYPE_CHECKING:
    from quid_core import Quid


class ExecutionOperation(str, Enum):
    STOP = "stop"
    REVERIFY = "reverify"
    RETRIEVE_MORE_EVIDENCE = "retrieve_more_evidence"
    TEST_HYPOTHESES = "test_hypotheses"
    RESOLVE_CONFLICT = "resolve_conflict"
    INSPECT_COUNTERFACTUAL_EFFECT = "inspect_counterfactual_effect"
    INSPECT_CAUSAL_PATHS = "inspect_causal_paths"


class ExecutionStatus(str, Enum):
    COMPLETED = "completed"
    WAITING = "waiting"
    BLOCKED = "blocked"


@dataclass(frozen=True, slots=True)
class ExecutionStep:
    operation: ExecutionOperation
    status: ExecutionStatus
    detail: str
    payload: object | None = None


@dataclass(frozen=True, slots=True)
class ExecutionResult:
    query: str
    operation: ExecutionOperation
    status: ExecutionStatus
    step: ExecutionStep
    source_result: IntegratedReasoningResult


class ExecutionControlPlane:
    """Executes the deterministic next action exposed by G3 metacognition.

    This layer deliberately does not invent new truth or silently resolve
    conflicts. It only performs bounded operations that already exist in the
    GRIOT architecture and returns a typed execution outcome.
    """

    def __init__(self, quid: Quid) -> None:
        self.quid = quid
        self.pipeline = GriotIntegrationPipeline(quid)
        self.verifier = VerificationEngine()

    def run(
        self,
        query: str,
        *,
        decompose: bool = True,
        hypothesis_limit: int = 8,
        max_hops: int = 8,
        context_source: str = "query",
    ) -> ExecutionResult:
        source = self.pipeline.run(
            query,
            decompose=decompose,
            hypothesis_limit=hypothesis_limit,
            max_hops=max_hops,
            context_source=context_source,
        )
        return self.execute(source)

    def execute(self, source: IntegratedReasoningResult) -> ExecutionResult:
        operation = self._operation(source.next_operation)
        step = self._execute_operation(operation, source)
        return ExecutionResult(
            query=source.query,
            operation=operation,
            status=step.status,
            step=step,
            source_result=source,
        )

    def _execute_operation(
        self,
        operation: ExecutionOperation,
        source: IntegratedReasoningResult,
    ) -> ExecutionStep:
        if operation is ExecutionOperation.STOP:
            return ExecutionStep(
                operation,
                ExecutionStatus.COMPLETED,
                "reasoning cycle is verified and has no pending operation",
            )

        if operation is ExecutionOperation.REVERIFY:
            advanced_result = source.advanced_reasoning.result
            report = self.verifier.verify(
                source.gir,
                advanced_result,
                source.advanced_reasoning.epistemic,
                reasoning_engine=self.quid.reasoning,
            )
            status = (
                ExecutionStatus.COMPLETED
                if report.ok
                else ExecutionStatus.WAITING
            )
            detail = (
                "reasoning replay verified successfully"
                if report.ok
                else "reasoning replay still requires correction"
            )
            return ExecutionStep(operation, status, detail, report)

        if operation is ExecutionOperation.RETRIEVE_MORE_EVIDENCE:
            retrieval_items: list[RetrievalResult] = []
            for target in source.query_plan.targets:
                retrieval_items.append(
                    self.quid.query_planner.retriever.retrieve(
                        subject=target.subject,
                        relation=target.relation,
                        object_=target.object,
                    )
                )
            total = sum(len(item.items) for item in retrieval_items)
            truncated = any(item.truncated for item in retrieval_items)
            detail = f"retrieved {total} bounded evidence items"
            if truncated:
                detail += " (retrieval budget reached)"
            return ExecutionStep(
                operation,
                ExecutionStatus.COMPLETED if total else ExecutionStatus.WAITING,
                detail,
                tuple(retrieval_items),
            )

        if operation is ExecutionOperation.TEST_HYPOTHESES:
            report = self.quid.hypotheses.generate(
                source.query,
                limit=8,
            )
            status = (
                ExecutionStatus.COMPLETED
                if report.hypotheses
                else ExecutionStatus.WAITING
            )
            detail = (
                f"generated {len(report.hypotheses)} explicit provisional hypotheses"
                if report.hypotheses
                else "no hypothesis was generated from current graph structure"
            )
            return ExecutionStep(operation, status, detail, report)

        if operation is ExecutionOperation.RESOLVE_CONFLICT:
            return ExecutionStep(
                operation,
                ExecutionStatus.WAITING,
                "conflict requires explicit review; no polarity is auto-selected",
                {
                    "review_required": True,
                    "status": source.epistemic_status.value,
                    "counterexamples": source.advanced_reasoning.counterexamples,
                },
            )

        if operation is ExecutionOperation.INSPECT_COUNTERFACTUAL_EFFECT:
            scenario = source.advanced_reasoning.counterfactual
            if scenario is None:
                return ExecutionStep(
                    operation,
                    ExecutionStatus.WAITING,
                    "no counterfactual scenario is available",
                )
            return ExecutionStep(
                operation,
                ExecutionStatus.COMPLETED,
                "counterfactual intervention is available for inspection",
                scenario,
            )

        if operation is ExecutionOperation.INSPECT_CAUSAL_PATHS:
            causal = source.advanced_reasoning.causal
            if causal is None or not causal.paths:
                return ExecutionStep(
                    operation,
                    ExecutionStatus.WAITING,
                    "no causal paths are available for inspection",
                    causal,
                )
            return ExecutionStep(
                operation,
                ExecutionStatus.COMPLETED,
                f"{len(causal.paths)} causal paths are available for inspection",
                causal,
            )

        raise RuntimeError(f"unsupported execution operation: {operation}")

    @staticmethod
    def _operation(value: str) -> ExecutionOperation:
        try:
            return ExecutionOperation(value)
        except ValueError as exc:
            raise ValueError(f"unknown G3 next_operation: {value!r}") from exc


__all__ = [
    "ExecutionControlPlane",
    "ExecutionOperation",
    "ExecutionResult",
    "ExecutionStatus",
    "ExecutionStep",
]

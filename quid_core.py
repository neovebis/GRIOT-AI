from __future__ import annotations

from dataclasses import dataclass

from griot_causality import CausalAnalysis, CausalityEngine
from griot_cognition_v100 import Assessment, EpistemicStateEngine, ProvenanceTrace
from griot_counterfactual import CounterfactualEngine, CounterfactualScenario
from griot_extraction import ExtractionBatch, KnowledgeExtractor
from griot_validation import KnowledgeValidator, ValidationReport
from griot_versioning import KnowledgeVersion, KnowledgeVersionStore
from griot_deduplication import DeduplicationReport, SemanticDeduplicator
from griot_consolidation import ConsolidationReport, KnowledgeConsolidator
from griot_demotion import DemotionAssessment, KnowledgeDemotionEngine
from griot_verification import VerificationEngine, VerificationReport
from griot_context import ContextView
from griot_discourse import DiscourseState
from griot_engine import Fact, GRIOT, Inference, TransitionRule
from griot_incremental import IncrementalLearner, IncrementalUpdate
from griot_knowledge_acquisition import (
    AcquisitionReport,
    KnowledgeAcquisitionEngine,
    KnowledgeDocument,
    KnowledgeSource,
    ReviewItem,
)
from griot_advanced_reasoning import (
    AdvancedReasoningEngine,
    AdvancedReasoningResult,
    Counterexample,
    DiscoveredRule,
    MetacognitiveState,
    ProbabilisticAssessment,
    ReasoningSubproblem,
)
from griot_integration_pipeline import GriotIntegrationPipeline, IntegratedReasoningResult
from griot_execution_control import (
    ExecutionControlPlane,
    ExecutionCycleResult,
    ExecutionResult,
    ExecutionOperation,
    ExecutionStatus,
    ExecutionStep,
)
from griot_intent import IntentType, SemanticIntent, SemanticIntentDetector
from griot_math import MathEngine, MathResult
from griot_hypothesis_v050 import HypothesisController, HypothesisReport
from griot_planning_v080 import ActionPlan, ActionSchema, GoalPlanner
from griot_promotion import KnowledgeAssessment, KnowledgeLevel, KnowledgePromotionEngine, PromotionPolicy
from griot_simulation import MonteCarloResult, SimulationEngine, SimulationResult
from griot_storage import SQLiteKnowledgeStore
from griot_sharding import ShardedKnowledgeStore
from griot_gir import GIR
from griot_query_planner import QueryPlan, QueryPlanner
from griot_working_graph import WorkingGraphState
from griot_reasoning_v040 import ReasoningEngine, ReasoningResult, TruthStatus
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
    discourse: DiscourseState
    intent: SemanticIntent
    math_result: MathResult | None
    answer_value: object | None
    verification: VerificationReport
    epistemic: Assessment
    provenance_trace: ProvenanceTrace
    query_plan: QueryPlan
    working_graph: WorkingGraphState
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
        self.reasoning = ReasoningEngine(self.semantic)
        self.epistemic = EpistemicStateEngine()
        self.query_planner = QueryPlanner(self.engine)
        self.math = MathEngine(self.engine)
        self.hypotheses = HypothesisController(self.reasoning)
        self.planner = GoalPlanner(self.engine)
        self.counterfactual = CounterfactualEngine(self.engine)
        self.causality = CausalityEngine(self.engine)
        self.simulation = SimulationEngine(self.engine)
        self.extractor = KnowledgeExtractor(self.engine)
        self.validator = KnowledgeValidator(self.engine)
        self.deduplicator = SemanticDeduplicator()
        self.consolidator = KnowledgeConsolidator(self.engine)
        self.promotion = KnowledgePromotionEngine()
        self.demotion = KnowledgeDemotionEngine(self.engine, self.promotion)
        self.versions = KnowledgeVersionStore()
        self.incremental = IncrementalLearner(self.engine)
        self.knowledge = KnowledgeAcquisitionEngine(self.engine)
        self.advanced_reasoning = AdvancedReasoningEngine(self.engine)
        self.verifier = VerificationEngine()
        self.integration = GriotIntegrationPipeline(self)
        self.execution = ExecutionControlPlane(self)

    def simulate(
        self,
        initial: dict[str, float],
        rules: tuple[TransitionRule, ...],
        *,
        steps: int,
    ) -> SimulationResult:
        return self.simulation.run(initial, rules, steps=steps)

    def incremental_learn(self, text: str, *, source: str) -> IncrementalUpdate:
        return self.incremental.learn(text, source=source)

    def extract_knowledge(self, text: str, *, source: str = "semantic-compiler") -> ExtractionBatch:
        return self.extractor.extract(text, source=source)

    def validate_knowledge(self, batch: ExtractionBatch) -> ValidationReport:
        return self.validator.validate(batch)

    def deduplicate_knowledge(self, batch: ExtractionBatch) -> DeduplicationReport:
        return self.deduplicator.deduplicate(
            item.candidate for item in self.validator.validate(batch).valid
        )

    def solve_advanced(
        self,
        query: str,
        *,
        decompose: bool = True,
        hypothesis_limit: int = 8,
        max_hops: int = 8,
    ) -> AdvancedReasoningResult:
        return self.advanced_reasoning.solve(
            query,
            decompose=decompose,
            hypothesis_limit=hypothesis_limit,
            max_hops=max_hops,
        )

    def select_reasoning_strategy(self, query: str) -> str:
        return self.advanced_reasoning.select_strategy(query)

    def decompose_reasoning(self, query: str) -> tuple[ReasoningSubproblem, ...]:
        return self.advanced_reasoning.decompose(query)

    def discover_reasoning_rules(self, *, min_support: int = 2) -> tuple[DiscoveredRule, ...]:
        return self.advanced_reasoning.discover_rules(min_support=min_support)

    def analisar_integrado(
        self,
        query: str,
        *,
        decompose: bool = True,
        hypothesis_limit: int = 8,
        max_hops: int = 8,
        context_source: str = "query",
    ) -> IntegratedReasoningResult:
        """Run the canonical G1 -> retrieval -> reasoning -> G3 pipeline."""
        return self.integration.run(
            query,
            decompose=decompose,
            hypothesis_limit=hypothesis_limit,
            max_hops=max_hops,
            context_source=context_source,
        )

    def executar_proximo_passo(
        self,
        query: str,
        *,
        decompose: bool = True,
        hypothesis_limit: int = 8,
        max_hops: int = 8,
        context_source: str = "query",
    ) -> ExecutionResult:
        """Run G1-G3 and execute the operation selected by metacognition."""
        return self.execution.run(
            query,
            decompose=decompose,
            hypothesis_limit=hypothesis_limit,
            max_hops=max_hops,
            context_source=context_source,
        )

    def executar_ciclo(
        self,
        query: str,
        *,
        max_cycles: int = 4,
        decompose: bool = True,
        hypothesis_limit: int = 8,
        max_hops: int = 8,
        context_source: str = "query-cycle",
    ) -> ExecutionCycleResult:
        """Run a bounded G1-G3 execution loop with loop detection."""
        return self.execution.run_cycle(
            query,
            max_cycles=max_cycles,
            decompose=decompose,
            hypothesis_limit=hypothesis_limit,
            max_hops=max_hops,
            context_source=context_source,
        )

    def adquirir_e_analisar(
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
        """Acquire durable knowledge through G2, then run the same G1-G3 path."""
        return self.integration.acquire_and_run(
            text,
            source=source,
            query=query,
            document_id=document_id,
            auto_commit=auto_commit,
            replace=replace,
            decompose=decompose,
            hypothesis_limit=hypothesis_limit,
            max_hops=max_hops,
            context_source=context_source,
        )

    def acquire_knowledge(
        self,
        text: str,
        *,
        source: str | KnowledgeSource,
        document_id: str | None = None,
        auto_commit: bool = True,
        replace: bool = True,
    ) -> AcquisitionReport:
        return self.knowledge.acquire_text(
            text,
            source=source,
            document_id=document_id,
            auto_commit=auto_commit,
            replace=replace,
        )

    def acquire_document(
        self,
        document: KnowledgeDocument,
        *,
        auto_commit: bool = True,
        replace: bool = True,
    ) -> AcquisitionReport:
        return self.knowledge.acquire_text(
            document.text,
            source=document.source,
            document_id=document.document_id,
            auto_commit=auto_commit,
            replace=replace,
        )

    def acquire_file(
        self,
        path: str,
        *,
        source: str | KnowledgeSource | None = None,
        document_id: str | None = None,
        auto_commit: bool = True,
        replace: bool = True,
    ) -> AcquisitionReport:
        return self.knowledge.acquire_file(
            path,
            source=source,
            document_id=document_id,
            auto_commit=auto_commit,
            replace=replace,
        )

    def review_knowledge(self, review_id: str, decision: str) -> ReviewItem:
        return self.knowledge.review(review_id, decision)

    def knowledge_review_queue(self) -> tuple[ReviewItem, ...]:
        return self.knowledge.review_queue()

    def assess_acquired_knowledge(self) -> tuple[KnowledgeAssessment, ...]:
        return self.knowledge.assess()

    def assess_knowledge(self) -> tuple[KnowledgeAssessment, ...]:
        return self.promotion.assess(self.engine.graph.facts())

    def knowledge_level(self, fact: Fact) -> KnowledgeLevel:
        return self.promotion.level(fact)

    def persist_storage(self, path: str) -> None:
        with SQLiteKnowledgeStore(path) as store:
            store.put_engine(self.engine)

    def persist_sharded(self, directory: str, *, shards: int = 8) -> None:
        with ShardedKnowledgeStore(directory, shards=shards) as store:
            store.put_engine(self.engine)

    @classmethod
    def from_storage(cls, path: str) -> "Quid":
        engine = GRIOT.create()
        with SQLiteKnowledgeStore(path) as store:
            store.load_engine(engine)
        return cls(engine)

    def version_knowledge(self) -> KnowledgeVersion:
        return self.versions.commit(self.engine.graph.facts())

    def get_knowledge_version(self, version_id: str) -> KnowledgeVersion | None:
        return self.versions.get(version_id)

    def knowledge_history(self) -> tuple[KnowledgeVersion, ...]:
        return self.versions.history()

    def reconcile_knowledge(self) -> tuple[DemotionAssessment, ...]:
        return self.demotion.reconcile()

    def consolidate_knowledge(self, batch: ExtractionBatch) -> ConsolidationReport:
        validation = self.validator.validate(batch)
        deduplication = self.deduplicator.deduplicate(
            item.candidate for item in validation.valid
        )
        return self.consolidator.consolidate(validation, deduplication)

    def generate_hypotheses(self, query: str, *, limit: int = 8) -> HypothesisReport:
        return self.hypotheses.generate(query, limit=limit)

    def causes_of(self, target: str, *, max_depth: int = 8) -> CausalAnalysis:
        return self.causality.causes_of(target, max_depth=max_depth)

    def effects_of(self, source: str, *, max_depth: int = 8) -> CausalAnalysis:
        return self.causality.effects_of(source, max_depth=max_depth)

    def run_counterfactual(
        self,
        assumption: str,
        query: str,
        *,
        initial_world: tuple[str, ...] = (),
        steps: int = 8,
    ) -> CounterfactualScenario:
        return self.counterfactual.run(
            assumption,
            query,
            initial_world=initial_world,
            steps=steps,
        )

    def register_action(
        self,
        label: str,
        *,
        preconditions: tuple[str, ...] = (),
        add_effects: tuple[str, ...] = (),
        remove_effects: tuple[str, ...] = (),
        cost: float = 1.0,
        confidence: float = 1.0,
        provenance: str = "planner",
    ) -> ActionSchema:
        return self.planner.register_action(
            label,
            preconditions=preconditions,
            add_effects=add_effects,
            remove_effects=remove_effects,
            cost=cost,
            confidence=confidence,
            provenance=provenance,
        )

    def plan_goal(
        self,
        initial: tuple[str, ...],
        goal: str | tuple[str, ...],
        *,
        max_depth: int = 8,
    ) -> ActionPlan | None:
        return self.planner.plan(initial, goal, max_depth=max_depth)

    def simulate_monte_carlo(
        self,
        initial: dict[str, float],
        transition: object,
        *,
        steps: int,
        runs: int,
        seed: int = 0,
        metric: object | None = None,
    ) -> MonteCarloResult:
        return self.simulation.monte_carlo(
            initial,
            transition,
            steps=steps,
            runs=runs,
            seed=seed,
            metric=metric,
        )

    def analisar(self, text: str) -> QuidAnalysis:
        """Return the legacy analysis contract projected from the canonical pipeline."""
        integrated = self.integration.run(text)

        gir = integrated.gir
        result = integrated.advanced_reasoning.result
        assessment = integrated.advanced_reasoning.epistemic
        verification = integrated.advanced_reasoning.verification
        semantic_intent = self.semantic.compiler.intent.detect(
            text,
            gir.frame,
        )
        math_result = integrated.advanced_reasoning.math_result

        answer: bool | None
        if result.status is TruthStatus.SUPPORTED:
            answer = True
        elif result.status is TruthStatus.REFUTED:
            answer = False
        else:
            answer = None
        if not verification.ok:
            answer = None

        graph_evidence: tuple[Fact | Inference, ...] = ()
        if integrated.query_plan.targets:
            target = integrated.query_plan.targets[0]
            graph_evidence = tuple(
                self.engine.graph.query(
                    target.subject,
                    target.relation,
                    target.object,
                )
            )

        resolved = tuple(dict.fromkeys(node.quid for node in gir.nodes))
        provenance_items = set(assessment.provenance.sources)
        if any(record.kind == "inference" for record in assessment.provenance.records):
            provenance_items.add("inference")
        provenance = tuple(sorted(provenance_items))

        return QuidAnalysis(
            text=text,
            gir=gir,
            reasoning=result,
            context=integrated.context,
            discourse=integrated.discourse,
            intent=semantic_intent,
            math_result=math_result,
            answer_value=integrated.answer_value,
            verification=verification,
            epistemic=assessment,
            provenance_trace=assessment.provenance,
            query_plan=integrated.query_plan,
            working_graph=integrated.working_graph,
            answer=answer,
            epistemic_status=result.status,
            confidence=result.confidence,
            semantic_facts=gir.facts(),
            graph_evidence=graph_evidence,
            resolved_quids=resolved,
            provenance=provenance,
            explanation=self._explanation(result),
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

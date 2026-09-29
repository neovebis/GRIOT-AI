from __future__ import annotations

from dataclasses import dataclass

from griot_causality import CausalAnalysis, CausalityEngine
from griot_cognition_v100 import Assessment, EpistemicStateEngine, ProvenanceTrace
from griot_counterfactual import CounterfactualEngine, CounterfactualScenario
from griot_extraction import ExtractionBatch, KnowledgeExtractor
from griot_validation import KnowledgeValidator, ValidationReport
from griot_deduplication import DeduplicationReport, SemanticDeduplicator
from griot_verification import VerificationEngine, VerificationReport
from griot_context import ContextView
from griot_discourse import DiscourseState
from griot_engine import Fact, GRIOT, Inference, TransitionRule
from griot_intent import IntentType, SemanticIntent, SemanticIntentDetector
from griot_math import MathEngine, MathResult
from griot_hypothesis_v050 import HypothesisController, HypothesisReport
from griot_planning_v080 import ActionPlan, ActionSchema, GoalPlanner
from griot_simulation import MonteCarloResult, SimulationEngine, SimulationResult
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

    def simulate(
        self,
        initial: dict[str, float],
        rules: tuple[TransitionRule, ...],
        *,
        steps: int,
    ) -> SimulationResult:
        return self.simulation.run(initial, rules, steps=steps)

    def extract_knowledge(self, text: str) -> ExtractionBatch:
        return self.extractor.extract(text)

    def validate_knowledge(self, batch: ExtractionBatch) -> ValidationReport:
        return self.validator.validate(batch)

    def deduplicate_knowledge(self, batch: ExtractionBatch) -> DeduplicationReport:
        return self.deduplicator.deduplicate(candidate.candidate for candidate in self.validator.validate(batch).valid)

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
        if not isinstance(text, str):
            raise TypeError("text must be a string")
        if not text.strip():
            raise ValueError("text must not be empty")

        gir = self.semantic.understand(text)
        context_view = self.engine.context.view(gir)
        discourse_state = self.engine.discourse.observe(
            text,
            gir,
            previous_records=self.engine.context.records(),
        )
        result = self.reasoning.reason_meaning(text, gir, context_view)
        assessment = self.epistemic.assess(result, text)
        semantic_intent = SemanticIntentDetector().detect(text, gir.frame)
        math_result = (
            self.math.calculate(text)
            if semantic_intent.primary is IntentType.CALCULATION
            else None
        )
        query_plan = self.query_planner.plan(gir, context_view)
        execution = self.query_planner.execute(query_plan, gir, context_view)
        working_state = execution.working_graph
        self.engine.context.ingest(gir, source="query")

        answer: bool | None
        if result.status is TruthStatus.SUPPORTED:
            answer = True
        elif result.status is TruthStatus.REFUTED:
            answer = False
        else:
            answer = None

        verification = self.verifier.verify(
            gir,
            result,
            assessment,
            reasoning_engine=self.reasoning,
        )
        if not verification.ok:
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
        provenance_items = set(assessment.provenance.sources)
        if any(record.kind == "inference" for record in assessment.provenance.records):
            provenance_items.add("inference")
        provenance = tuple(sorted(provenance_items))

        explanation = self._explanation(result)

        return QuidAnalysis(
            text=text,
            gir=gir,
            reasoning=result,
            context=result.context or context_view,
            discourse=discourse_state,
            intent=semantic_intent,
            math_result=math_result,
            answer_value=(math_result.value if math_result and math_result.value is not None else answer),
            verification=verification,
            epistemic=assessment,
            provenance_trace=assessment.provenance,
            query_plan=query_plan,
            working_graph=working_state,
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

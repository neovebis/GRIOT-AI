from __future__ import annotations

from dataclasses import dataclass
import math
import re
from typing import Iterable, Mapping

from griot_causality import CausalAnalysis, CausalityEngine
from griot_cognition_v100 import Assessment, EpistemicStateEngine
from griot_counterfactual import CounterfactualEngine, CounterfactualScenario
from griot_engine import Fact, GRIOT, Inference
from griot_hypothesis_v050 import HypothesisController, HypothesisReport
from griot_math import MathEngine, MathResult
from griot_planning_v080 import ActionPlan, GoalPlanner
from griot_reasoning_v040 import ReasoningEngine, ReasoningResult, TruthStatus
from griot_semantic_ir import SemanticGRIOT
from griot_verification import VerificationEngine, VerificationReport


@dataclass(frozen=True, slots=True)
class ReasoningSubproblem:
    text: str
    strategy: str
    reason: str


@dataclass(frozen=True, slots=True)
class ProbabilisticAssessment:
    support_probability: float
    refutation_probability: float
    evidence_count: int
    independent_sources: int
    method: str


@dataclass(frozen=True, slots=True)
class DiscoveredRule:
    antecedent_relation: str
    bridge_relation: str
    consequent_relation: str
    support_count: int
    confidence: float
    examples: tuple[tuple[str, str, str], ...]


@dataclass(frozen=True, slots=True)
class Counterexample:
    kind: str
    fact: Fact
    reason: str


@dataclass(frozen=True, slots=True)
class MetacognitiveState:
    confidence: float
    knowledge_status: TruthStatus
    evidence_count: int
    proof_depth: int
    source_diversity: int
    unresolved: bool
    next_operation: str
    limitations: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class AdvancedReasoningResult:
    query: str
    strategy: str
    decomposition: tuple[ReasoningSubproblem, ...]
    subresults: tuple[ReasoningResult, ...]
    result: ReasoningResult
    probabilistic: ProbabilisticAssessment
    math_result: MathResult | None
    hypotheses: HypothesisReport | None
    counterfactual: CounterfactualScenario | None
    causal: CausalAnalysis | None
    discovered_rules: tuple[DiscoveredRule, ...]
    counterexamples: tuple[Counterexample, ...]
    verification: VerificationReport
    epistemic: Assessment
    metacognition: MetacognitiveState

    @property
    def solved(self) -> bool:
        return (
            self.result.status in {TruthStatus.SUPPORTED, TruthStatus.REFUTED}
            or (self.math_result is not None and self.math_result.status != "invalid")
        )

    @property
    def answer_value(self):
        if self.math_result is not None and self.math_result.value is not None:
            return self.math_result.value
        if self.result.status is TruthStatus.SUPPORTED:
            return True
        if self.result.status is TruthStatus.REFUTED:
            return False
        return None

    @property
    def proof(self):
        return self.result.proofs


class AdvancedReasoningEngine:
    """G3 coordinator for decomposition, strategy selection and proof-oriented reasoning.

    G3 reuses the stable C1-C7 engines and adds one deterministic control plane:
    decompose -> choose strategy -> reason -> compare hypotheses/counterfactuals ->
    discover patterns -> verify proof -> expose epistemic next action.
    """

    STRATEGIES = frozenset({
        "mathematical",
        "counterfactual",
        "causal",
        "temporal",
        "probabilistic",
        "planning",
        "hypothetical",
        "direct",
    })

    def __init__(self, engine: GRIOT | None = None) -> None:
        self.engine = engine or GRIOT.create()
        self.semantic = SemanticGRIOT(self.engine)
        self.reasoning = ReasoningEngine(self.semantic)
        self.epistemic = EpistemicStateEngine()
        self.verifier = VerificationEngine()
        self.hypotheses = HypothesisController(self.reasoning)
        self.math = MathEngine(self.engine)
        self.counterfactual_engine = CounterfactualEngine(self.engine)
        self.causality = CausalityEngine(self.engine)
        self.planner = GoalPlanner(self.engine)

    def solve(
        self,
        query: str,
        *,
        decompose: bool = True,
        hypothesis_limit: int = 8,
        max_hops: int = 8,
    ) -> AdvancedReasoningResult:
        if not isinstance(query, str):
            raise TypeError("query must be a string")
        if not query.strip():
            raise ValueError("query must not be empty")
        if hypothesis_limit <= 0:
            raise ValueError("hypothesis_limit must be > 0")
        if max_hops < 0:
            raise ValueError("max_hops must be >= 0")

        strategy = self.select_strategy(query)
        subproblems = self.decompose(query) if decompose else (
            ReasoningSubproblem(query.strip(), strategy, "single problem"),
        )
        subresults = tuple(
            self.reasoning.reason(problem.text)
            for problem in subproblems
        )
        result = self._synthesize(query, subresults)
        math_result = self.math.calculate(query) if strategy == "mathematical" else None

        probabilistic = self.probabilistic(result)
        hypotheses = None
        counterfactual = None
        causal = None

        if strategy == "hypothetical" and result.status is TruthStatus.UNKNOWN:
            hypotheses = self.hypotheses.generate(query, limit=hypothesis_limit)
        elif strategy == "counterfactual":
            assumption = self._counterfactual_assumption(query)
            if assumption:
                try:
                    counterfactual = self.counterfactual_engine.run(
                        assumption,
                        query,
                        steps=max_hops,
                    )
                except ValueError:
                    counterfactual = None
        elif strategy == "causal":
            target = self._first_query_object(query)
            if target is not None:
                causal = self.causality.causes_of(target, max_depth=max_hops)

        discovered = self.discover_rules()
        counterexamples = self.find_counterexamples(result)
        assessment = self.epistemic.assess(result, query)
        verification = self.verifier.verify(
            result.meaning,
            result,
            assessment,
            reasoning_engine=self.reasoning,
        )
        metacognition = self._metacognition(
            result,
            assessment,
            verification,
            hypotheses= hypotheses,
            counterfactual=counterfactual,
            causal=causal,
            strategy=strategy,
            math_result=math_result,
        )

        return AdvancedReasoningResult(
            query,
            strategy,
            subproblems,
            subresults,
            result,
            probabilistic,
            math_result,
            hypotheses,
            counterfactual,
            causal,
            discovered,
            counterexamples,
            verification,
            assessment,
            metacognition,
        )

    def select_strategy(self, query: str) -> str:
        normalized = query.casefold().strip()
        try:
            frame = self.semantic.understand(query)
            intent = frame.intent.casefold()
        except Exception:
            intent = ""

        if re.search(r"\b(?:e se|se isso|caso contrário|caso contrario)\b", normalized):
            return "counterfactual"
        if intent == "calculate" or re.search(r"(?:calcula|equação|equacao|matriz|estatística|estatistica)\b", normalized):
            return "mathematical"
        if re.search(r"\b(?:probabilidade|probabilidade de|chance|risco|percentagem|porcentagem)\b", normalized):
            return "probabilistic"
        if re.search(r"\b(?:por que|porque|causa|causou|consequência|consequencia|efeito)\b", normalized):
            return "causal"
        if re.search(r"\b(?:antes de|depois de|ontem|hoje|amanhã|amanha|quando|durante|enquanto)\b", normalized):
            return "temporal"
        if re.search(r"\b(?:como faço|como fazer|como conseguir|atingir|alcançar|alcancar|plano para|planeia|planejar)\b", normalized):
            return "planning"
        if re.search(r"\b(?:poderia|seria possível|seria possivel|hipótese|hipotese|supondo|assumindo)\b", normalized):
            return "hypothetical"
        return "direct"

    def decompose(self, query: str, *, max_parts: int = 16) -> tuple[ReasoningSubproblem, ...]:
        if max_parts <= 0:
            raise ValueError("max_parts must be > 0")
        text = re.sub(r"\s+", " ", query.strip())
        clauses = [
            chunk.strip(" ,;")
            for chunk in re.split(
                r"(?<=[.!?])\s+|\s+(?:e também|além disso|alem disso|mas também|mas tambem)\s+",
                text,
                flags=re.I,
            )
            if chunk.strip(" ,;")
        ]

        if len(clauses) == 1:
            # A compound declarative question with two explicit propositions
            # can be split conservatively at a top-level conjunction.
            parts = [
                chunk.strip(" ,;")
                for chunk in re.split(r"\s+e\s+(?=[A-ZÀ-Ý]|[a-zà-ÿ]+\s+(?:é|tem|faz|está|esta|pode|deve|causa|cria|ataca)\b)", clauses[0])
                if chunk.strip(" ,;")
            ]
            if 1 < len(parts) <= max_parts:
                clauses = parts

        clauses = clauses[:max_parts]
        return tuple(self._make_subproblem(item) for item in clauses)

    def probabilistic(self, result: ReasoningResult) -> ProbabilisticAssessment:
        support_facts: list[Fact] = []
        refute_facts: list[Fact] = []
        graph = self.engine.graph

        for claim in result.claims:
            direct = [
                fact for fact in graph.facts()
                if fact.subject == claim.subject
                and fact.relation == claim.relation
                and fact.object == claim.object
            ]
            for fact in direct:
                if fact.negated == claim.requested_negated:
                    support_facts.append(fact)
                else:
                    refute_facts.append(fact)

        def combine(values: Iterable[float]) -> float:
            probability = 0.0
            for value in values:
                bounded = max(0.0, min(1.0, float(value)))
                probability = 1.0 - (1.0 - probability) * (1.0 - bounded)
            return max(0.0, min(1.0, probability))

        support_sources = {fact.provenance for fact in support_facts if fact.provenance}
        refute_sources = {fact.provenance for fact in refute_facts if fact.provenance}
        return ProbabilisticAssessment(
            combine(fact.confidence for fact in support_facts),
            combine(fact.confidence for fact in refute_facts),
            len(support_facts) + len(refute_facts),
            max(len(support_sources), len(refute_sources)),
            "noisy-or over explicit evidence confidences",
        )

    def discover_rules(self, *, min_support: int = 2) -> tuple[DiscoveredRule, ...]:
        if min_support <= 0:
            raise ValueError("min_support must be > 0")
        facts = tuple(fact for fact in self.engine.graph.facts() if not fact.negated)
        by_subject: dict[str, list[Fact]] = {}
        by_pair: dict[tuple[str, str], list[Fact]] = {}
        for fact in facts:
            by_subject.setdefault(fact.subject, []).append(fact)
            by_pair.setdefault((fact.subject, fact.object), []).append(fact)

        patterns: dict[tuple[str, str, str], set[tuple[str, str, str]]] = {}
        for first in facts:
            for second in by_subject.get(first.object, ()):
                for third in by_pair.get((first.subject, second.object), ()):
                    key = (first.relation, second.relation, third.relation)
                    patterns.setdefault(key, set()).add(
                        (first.subject, first.object, second.object)
                    )

        output: list[DiscoveredRule] = []
        for (r1, r2, r3), examples_set in sorted(patterns.items()):
            examples = tuple(sorted(examples_set))
            if len(examples) < min_support:
                continue
            confidence = min(1.0, len(examples) / max(1, len(facts)))
            output.append(
                DiscoveredRule(r1, r2, r3, len(examples), confidence, examples[:16])
            )
        return tuple(output)

    def find_counterexamples(self, result: ReasoningResult) -> tuple[Counterexample, ...]:
        output: list[Counterexample] = []
        graph = self.engine.graph
        for claim in result.claims:
            opposites = [
                fact for fact in graph.facts()
                if fact.subject == claim.subject
                and fact.relation == claim.relation
                and fact.object == claim.object
                and fact.negated != claim.requested_negated
            ]
            for fact in sorted(opposites, key=lambda item: (-item.confidence, item.provenance)):
                output.append(
                    Counterexample(
                        "contrary-evidence",
                        fact,
                        "durable evidence with opposite polarity to the queried claim",
                    )
                )

        if result.status is TruthStatus.SUPPORTED:
            # A supported multi-hop result is also checked for unsupported
            # alternatives in the graph that point to the same target.
            for claim in result.claims:
                if claim.status is not TruthStatus.SUPPORTED:
                    continue
                alternatives = [
                    fact for fact in graph.facts()
                    if fact.relation == claim.relation
                    and fact.object == claim.object
                    and fact.subject != claim.subject
                    and not fact.negated
                ]
                for fact in sorted(alternatives, key=lambda item: (-item.confidence, item.subject)):
                    output.append(
                        Counterexample(
                            "alternative-support",
                            fact,
                            "another subject satisfies the same relation/object pattern; query is not exclusive",
                        )
                    )
        return tuple(output)

    def optimize_plan(
        self,
        initial: Iterable[str],
        goal: str | Iterable[str],
        *,
        max_depth: int = 8,
    ) -> ActionPlan | None:
        return self.planner.plan(initial, goal, max_depth=max_depth)

    def deduce(self, query: str) -> ReasoningResult:
        return self.reasoning.reason(query)

    def induce(self, *, min_support: int = 2) -> tuple[DiscoveredRule, ...]:
        return self.discover_rules(min_support=min_support)

    def abduce(self, target: str, *, max_depth: int = 8) -> CausalAnalysis:
        return self.causality.causes_of(target, max_depth=max_depth)

    def hierarchical_plan(
        self,
        initial: Iterable[str],
        goals: Iterable[str],
        *,
        max_depth: int = 8,
    ) -> tuple[ActionPlan, ...]:
        current = tuple(initial)
        plans: list[ActionPlan] = []
        for goal in goals:
            plan = self.planner.plan(current, goal, max_depth=max_depth)
            if plan is None:
                break
            plans.append(plan)
            current = self.planner.labels(plan.final)
        return tuple(plans)

    def test_hypotheses(
        self,
        query: str,
        *,
        limit: int = 8,
    ) -> HypothesisReport:
        return self.hypotheses.generate(query, limit=limit)

    def test_counterfactual(
        self,
        assumption: str,
        query: str,
        *,
        steps: int = 8,
    ) -> CounterfactualScenario:
        return self.counterfactual_engine.run(
            assumption,
            query,
            steps=steps,
        )

    def temporal_query(
        self,
        query: str,
        *,
        max_depth: int = 8,
    ) -> ReasoningResult:
        if max_depth < 0:
            raise ValueError("max_depth must be >= 0")
        return self.reasoning.reason(query)

    def _synthesize(
        self,
        query: str,
        results: tuple[ReasoningResult, ...],
    ) -> ReasoningResult:
        if not results:
            meaning = self.semantic.understand(query)
            return ReasoningResult(TruthStatus.UNKNOWN, 0.0, meaning, ())

        statuses = {item.status for item in results}
        if TruthStatus.CONFLICT in statuses:
            status = TruthStatus.CONFLICT
            confidence = max(item.confidence for item in results)
        elif any(item.status is TruthStatus.REFUTED for item in results):
            status = TruthStatus.REFUTED
            confidence = max(
                item.confidence for item in results
                if item.status is TruthStatus.REFUTED
            )
        elif all(item.status is TruthStatus.SUPPORTED for item in results):
            status = TruthStatus.SUPPORTED
            confidence = min(item.confidence for item in results)
        else:
            status = TruthStatus.UNKNOWN
            confidence = 0.0

        base = results[0]
        proofs = self._dedupe_proofs(proof for result in results for proof in result.proofs)
        causes = self._dedupe_proofs(cause for result in results for cause in result.causes)
        claims = tuple(claim for result in results for claim in result.claims)
        return ReasoningResult(
            status,
            confidence,
            base.meaning,
            proofs,
            causes,
            claims,
            base.context,
        )

    @staticmethod
    def _dedupe_proofs(proofs):
        seen = set()
        out = []
        for proof in proofs:
            key = (
                proof.relation,
                proof.subject,
                proof.object,
                proof.confidence,
                proof.rule,
                proof.provenance,
            )
            if key in seen:
                continue
            seen.add(key)
            out.append(proof)
        return tuple(out)

    def _make_subproblem(self, text: str) -> ReasoningSubproblem:
        strategy = self.select_strategy(text)
        return ReasoningSubproblem(text, strategy, self._strategy_reason(strategy))

    @staticmethod
    def _counterfactual_assumption(query: str) -> str:
        return re.sub(
            r"^\s*e\s+se\s+",
            "",
            query.strip(),
            count=1,
            flags=re.I,
        ).rstrip(" ?!.")

    @staticmethod
    def _strategy_reason(strategy: str) -> str:
        return {
            "mathematical": "query contains arithmetic/calculation intent",
            "counterfactual": "query requests an alternative assumption/world",
            "causal": "query requests cause, effect or explanation",
            "temporal": "query contains temporal ordering or temporal markers",
            "probabilistic": "query asks about probability, chance or risk",
            "planning": "query asks for a route/action sequence toward a goal",
            "hypothetical": "query explicitly requests a supposition or hypothesis",
            "direct": "query maps directly to semantic graph reasoning",
        }[strategy]

    def _first_query_object(self, query: str) -> str | None:
        try:
            meaning = self.semantic.understand(query)
        except Exception:
            return None
        edges = [edge for edge in meaning.edges if edge.relation in self.reasoning.QUERY_RELATIONS]
        if not edges:
            return None
        nodes = {node.node_id: node for node in meaning.nodes}
        target = nodes.get(edges[0].target)
        return target.quid if target else None

    def _metacognition(
        self,
        result: ReasoningResult,
        assessment: Assessment,
        verification: VerificationReport,
        *,
        hypotheses: HypothesisReport | None,
        counterfactual: CounterfactualScenario | None,
        causal: CausalAnalysis | None,
        strategy: str,
        math_result: MathResult | None,
    ) -> MetacognitiveState:
        limitations: list[str] = []
        if math_result is not None and math_result.status == "invalid":
            limitations.append("mathematical expression could not be evaluated")
        if result.status is TruthStatus.UNKNOWN:
            limitations.append("insufficient explicit evidence")
        if result.status is TruthStatus.CONFLICT:
            limitations.append("contradictory evidence prevents a final boolean conclusion")
        if result.confidence < 0.75 and result.status in {TruthStatus.SUPPORTED, TruthStatus.REFUTED}:
            limitations.append("conclusion has moderate or low confidence")
        if verification.ok is False:
            limitations.append("proof verification rejected the current reasoning trace")
        if hypotheses is not None and not hypotheses.hypotheses:
            limitations.append("no hypothesis was generated from available graph structure")
        if counterfactual is not None and not counterfactual.changed:
            limitations.append("counterfactual intervention did not change the result")
        if causal is not None and not causal.paths:
            limitations.append("no causal path was found")
        if strategy == "planning":
            limitations.append("planning requires explicit registered action schemas and an initial state")
        next_operation = self._next_operation(
            result,
            verification,
            hypotheses,
            counterfactual,
            causal,
            strategy=strategy,
            math_result=math_result,
        )
        return MetacognitiveState(
            float(result.confidence),
            result.status,
            len(result.proofs),
            len(result.causes),
            assessment.source_diversity,
            result.status in {TruthStatus.UNKNOWN, TruthStatus.CONFLICT} or not verification.ok,
            next_operation,
            tuple(dict.fromkeys(limitations)),
        )

    @staticmethod
    def _next_operation(
        result: ReasoningResult,
        verification: VerificationReport,
        hypotheses: HypothesisReport | None,
        counterfactual: CounterfactualScenario | None,
        causal: CausalAnalysis | None,
        *,
        strategy: str,
        math_result: MathResult | None,
    ) -> str:
        if strategy == "mathematical" and math_result is not None and math_result.status != "invalid":
            return "stop"
        if not verification.ok:
            return "reverify"
        if result.status is TruthStatus.CONFLICT:
            return "resolve_conflict"
        if result.status is TruthStatus.UNKNOWN:
            if hypotheses is not None and hypotheses.hypotheses:
                return "test_hypotheses"
            return "retrieve_more_evidence"
        if counterfactual is not None and counterfactual.changed:
            return "inspect_counterfactual_effect"
        if causal is not None and causal.paths:
            return "inspect_causal_paths"
        return "stop"
    

__all__ = [
    "AdvancedReasoningEngine",
    "AdvancedReasoningResult",
    "Counterexample",
    "DiscoveredRule",
    "MetacognitiveState",
    "ProbabilisticAssessment",
    "ReasoningSubproblem",
]

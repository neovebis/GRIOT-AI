from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable

from griot.engine import GRIOT
from griot.types import Fact, Inference, SemanticFrame
from griot_reasoning_v040 import ReasoningController, ReasoningResult, TruthStatus
from griot_hypothesis_v050 import Hypothesis


class QualityClass(str, Enum):
    DIRECT = "direct"
    INFERRED = "inferred"
    CONFLICTED = "conflicted"
    UNKNOWN = "unknown"


@dataclass(frozen=True, slots=True)
class SelfAssessment:
    query: str
    status: TruthStatus
    quality_class: QualityClass
    confidence: float
    evidence_count: int
    direct_evidence_count: int
    inferred_evidence_count: int
    provenance_diversity: int
    proof_depth: int
    quality_score: float
    caveats: tuple[str, ...]
    recommended_action: str


@dataclass(frozen=True, slots=True)
class ExperimentPlan:
    hypothesis: Hypothesis
    predictions: tuple[Fact, ...]
    observations_needed: tuple[str, ...]
    acceptance_rule: str
    rejection_rule: str


class MetacognitiveController:
    """
    Evaluates GRIOT's own conclusions without changing durable memory.
    """

    def __init__(self, reasoning: ReasoningController | None = None) -> None:
        self.reasoning = reasoning or ReasoningController()

    def assess(self, query: str) -> SelfAssessment:
        result = self.reasoning.reason(query)
        proofs = result.proofs
        direct = sum(step.rule == "direct" for step in proofs)
        inferred = len(proofs) - direct
        provenance = len({step.provenance for step in proofs if step.provenance})
        depth = max(
            (sum(step.rule != "direct" for step in proofs),),
            default=0,
        )
        caveats: list[str] = []

        if result.status is TruthStatus.CONFLICT:
            quality_class = QualityClass.CONFLICTED
            caveats.append("conflicting evidence is present")
            action = "resolve_conflicting_evidence"
            score = max(0.0, result.confidence * 0.55)
        elif result.status is TruthStatus.UNKNOWN:
            quality_class = QualityClass.UNKNOWN
            caveats.append("no supporting or refuting proof was found")
            action = "generate_hypotheses_and_seek_evidence"
            score = 0.0
        elif direct > 0 and inferred == 0:
            quality_class = QualityClass.DIRECT
            action = "use_with_recorded_provenance"
            score = min(1.0, result.confidence * 0.82 + min(0.18, 0.06 * provenance))
        else:
            quality_class = QualityClass.INFERRED
            caveats.append("answer depends on inference rather than only direct evidence")
            action = "verify_independently_before_high_stakes_use"
            score = min(1.0, result.confidence * 0.72 + min(0.18, 0.06 * provenance))

        if provenance <= 1 and result.status in {TruthStatus.SUPPORTED, TruthStatus.REFUTED}:
            caveats.append("evidence has low source diversity")
            score = max(0.0, score - 0.08)

        return SelfAssessment(
            query=query,
            status=result.status,
            quality_class=quality_class,
            confidence=result.confidence,
            evidence_count=len(proofs),
            direct_evidence_count=direct,
            inferred_evidence_count=inferred,
            provenance_diversity=provenance,
            proof_depth=depth,
            quality_score=score,
            caveats=tuple(caveats),
            recommended_action=action,
        )


class ExperimentPlanner:
    """
    Converts a provisional hypothesis into graph-derived predictions to test.

    Predictions are explicitly provisional and are never committed automatically.
    """

    COMPOSITIONS: tuple[tuple[str, str, str], ...] = (
        ("is_a", "has", "has"),
        ("is_a", "causes", "causes"),
        ("is_a", "part_of", "part_of"),
        ("is_a", "wants", "wants"),
        ("is_a", "needs", "needs"),
        ("causes", "causes", "causes"),
    )

    def __init__(self, reasoning: ReasoningController | None = None) -> None:
        self.reasoning = reasoning or ReasoningController()

    def plan(self, hypothesis: Hypothesis) -> ExperimentPlan:
        source_engine = self.reasoning.semantic.engine
        sandbox = self._clone_engine(source_engine)
        sandbox.graph.add_fact(
            Fact(
                hypothesis.assumption.subject,
                hypothesis.assumption.relation,
                hypothesis.assumption.object,
                hypothesis.assumption.confidence,
                hypothesis.assumption.negated,
                "hypothesis-sandbox",
                hypothesis.assumption.evidence,
            )
        )

        predictions = self._predict_from_fact(sandbox, hypothesis.assumption)
        observations = tuple(
            f"observar independentemente: {self._label(sandbox, p.subject)} "
            f"{p.relation} {self._label(sandbox, p.object)}"
            for p in predictions
        )

        return ExperimentPlan(
            hypothesis=hypothesis,
            predictions=tuple(predictions),
            observations_needed=observations,
            acceptance_rule="accept only when an independent observation supports at least one predicted relation and no high-confidence contradiction is found",
            rejection_rule="reject or downgrade when a predicted relation receives strong contradictory evidence",
        )

    @classmethod
    def _predict_from_fact(cls, engine: GRIOT, seed: Fact) -> list[Fact]:
        if seed.negated:
            return []
        graph = engine.graph
        out: dict[tuple[str, str, str], Fact] = {}
        for first, second, result_relation in cls.COMPOSITIONS:
            if seed.relation != first:
                continue
            for second_fact in graph.facts():
                if (
                    second_fact.subject == seed.object
                    and second_fact.relation == second
                    and not second_fact.negated
                ):
                    predicted = Fact(
                        seed.subject,
                        result_relation,
                        second_fact.object,
                        min(seed.confidence, second_fact.confidence) * 0.8,
                        False,
                        "prediction",
                        f"derived from {seed.relation} + {second}",
                    )
                    out[(predicted.subject, predicted.relation, predicted.object)] = predicted
        return sorted(out.values(), key=lambda f: (f.relation, f.object))

    @staticmethod
    def _clone_engine(source: GRIOT) -> GRIOT:
        sandbox = GRIOT(source.config)
        builtin_codes = {q.code for q in sandbox.quids.all()}
        builtin_symbols = {q.symbol for q in sandbox.quids.all()}
        for q in source.quids.all():
            if q.code in builtin_codes or q.symbol in builtin_symbols:
                continue
            sandbox.quids.load((q,))
        for fact in source.graph.facts():
            sandbox.graph.add_fact(fact)
        return sandbox

    @staticmethod
    def _label(engine: GRIOT, symbol: str) -> str:
        q = engine.quids.get(symbol)
        return q.label if q else symbol


__all__ = [
    "QualityClass",
    "SelfAssessment",
    "ExperimentPlan",
    "MetacognitiveController",
    "ExperimentPlanner",
]

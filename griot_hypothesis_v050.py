from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable

from griot_reasoning_v040 import ReasoningController, ReasoningResult, TruthStatus
from griot.engine import GRIOT
try:
    from griot_engine import Fact, Inference
except ImportError:
    from griot.types import Fact, Inference


class HypothesisKind(str, Enum):
    ANALOGY = "analogy"
    COMPOSITION = "composition"
    CAUSAL = "causal"


@dataclass(frozen=True, slots=True)
class Hypothesis:
    kind: HypothesisKind
    assumption: Fact
    confidence: float
    rationale: str
    evidence: tuple[Fact | Inference, ...] = ()
    heuristic: bool = True


@dataclass(frozen=True, slots=True)
class HypothesisReport:
    query: str
    hypotheses: tuple[Hypothesis, ...]
    source_status: TruthStatus


@dataclass(frozen=True, slots=True)
class CounterfactualResult:
    assumption: Fact
    query: str
    before: ReasoningResult
    after: ReasoningResult
    changed: bool


class HypothesisController:
    """
    Generates explicitly provisional hypotheses and tests local counterfactuals.

    A hypothesis is never automatically committed to GRIOT memory.
    """

    COMPOSITIONS: tuple[tuple[str, str, str], ...] = (
        ("is_a", "is_a", "is_a"),
        ("part_of", "is_a", "part_of"),
        ("member_of", "is_a", "member_of"),
        ("is_a", "has", "has"),
        ("is_a", "causes", "causes"),
        ("causes", "causes", "causes"),
    )

    def __init__(self, reasoning: ReasoningController | None = None) -> None:
        self.reasoning = reasoning or ReasoningController()

    def generate(self, query: str, limit: int = 8) -> HypothesisReport:
        if limit <= 0:
            raise ValueError("limit must be > 0")
        meaning = self.reasoning.semantic.understand(query)
        edges = [e for e in meaning.edges if e.relation in self.reasoning.QUERY_RELATIONS]
        if not edges:
            return HypothesisReport(query, (), TruthStatus.UNKNOWN)

        edge = edges[0]
        nodes = {n.node_id: n for n in meaning.nodes}
        subject = nodes[edge.source].quid
        object_ = nodes[edge.target].quid
        current = self.reasoning.reason(query)

        if current.status is not TruthStatus.UNKNOWN:
            return HypothesisReport(query, (), current.status)

        graph = self.reasoning.semantic.engine.graph
        candidates: dict[tuple[str, str, str, bool], Hypothesis] = {}

        # 1) Compositional graph hypotheses.
        for first_relation, second_relation, output_relation in self.COMPOSITIONS:
            if output_relation != edge.relation:
                continue
            first_facts = [
                f for f in graph.facts()
                if f.subject == subject and f.relation == first_relation and not f.negated
            ]
            second_index = [
                f for f in graph.facts()
                if f.relation == second_relation and not f.negated
            ]
            for first in first_facts:
                for second in second_index:
                    if second.subject != first.object:
                        continue
                    if second.object != object_:
                        continue
                    fact = Fact(subject, output_relation, object_, 0.55, False, "hypothesis", query)
                    key = (fact.subject, fact.relation, fact.object, fact.negated)
                    candidates[key] = Hypothesis(
                        HypothesisKind.COMPOSITION,
                        fact,
                        0.55,
                        f"composition: {first_relation} followed by {second_relation}",
                        (first, second),
                    )

        # 2) Type-based analogy hypotheses.
        subject_types = {
            f.object for f in graph.facts()
            if f.subject == subject and f.relation == "is_a" and not f.negated
        }
        for sibling in graph.facts():
            if sibling.relation != "is_a" or sibling.negated or sibling.object != object_:
                continue
            sibling_types = {
                f.object for f in graph.facts()
                if f.subject == sibling.subject and f.relation == "is_a" and not f.negated
            }
            shared = sorted(subject_types & sibling_types)
            if not shared or sibling.subject == subject:
                continue
            type_fact = next(
                (
                    f for f in graph.facts()
                    if f.subject == sibling.subject
                    and f.relation == "is_a"
                    and f.object in shared
                    and not f.negated
                ),
                None,
            )
            if type_fact is None:
                continue
            fact = Fact(subject, edge.relation, object_, 0.35, False, "hypothesis", query)
            key = (fact.subject, fact.relation, fact.object, fact.negated)
            candidates.setdefault(
                key,
                Hypothesis(
                    HypothesisKind.ANALOGY,
                    fact,
                    0.35,
                    f"analogy: {subject} and {sibling.subject} share type {shared[0]}",
                    (type_fact, sibling),
                ),
            )

        # 3) Causal hypotheses: a known cause chain points at the queried effect.
        if edge.relation == "causes":
            parents = [
                f for f in graph.facts()
                if f.relation == "causes" and f.object == object_ and not f.negated
            ]
            for parent in parents:
                if parent.subject == subject:
                    continue
                bridge = next(
                    (
                        f for f in graph.facts()
                        if f.relation == "causes"
                        and f.object == parent.subject
                        and f.subject == subject
                        and not f.negated
                    ),
                    None,
                )
                if bridge:
                    fact = Fact(subject, "causes", object_, 0.65, False, "hypothesis", query)
                    key = (fact.subject, fact.relation, fact.object, fact.negated)
                    candidates.setdefault(
                        key,
                        Hypothesis(
                            HypothesisKind.CAUSAL,
                            fact,
                            0.65,
                            "causal chain observed in graph",
                            (bridge, parent),
                        ),
                    )

        ordered = sorted(
            candidates.values(),
            key=lambda h: (-h.confidence, h.kind.value, h.assumption.subject, h.assumption.object),
        )
        return HypothesisReport(query, tuple(ordered[:limit]), current.status)

    def counterfactual(self, assumption: str, query: str) -> CounterfactualResult:
        parsed = self.reasoning.semantic.understand(assumption)
        facts = parsed.facts()
        if not facts:
            raise ValueError("assumption produced no semantic fact")
        assumption_fact = next(
            (f for f in facts if f.relation in self.reasoning.QUERY_RELATIONS),
            None,
        )
        if assumption_fact is None:
            raise ValueError("assumption has no supported relation")

        before = self.reasoning.reason(query)
        source_semantic = self.reasoning.semantic
        source_engine = source_semantic.engine

        # Explicitly clone the semantic state instead of deepcopying the QUID
        # registry; its itertools allocator is intentionally not copyable.
        sandbox_engine = GRIOT(source_engine.config)
        builtin_codes = {q.code for q in sandbox_engine.quids.all()}
        builtin_symbols = {q.symbol for q in sandbox_engine.quids.all()}
        for q in source_engine.quids.all():
            if q.code in builtin_codes or q.symbol in builtin_symbols:
                continue
            sandbox_engine.quids.load((q,))
        for fact in source_engine.graph.facts():
            sandbox_engine.graph.add_fact(fact)

        from griot_semantic_ir import SemanticGRIOT
        sandbox = SemanticGRIOT(sandbox_engine)

        graph = sandbox.engine.graph
        # Intervention: remove the opposite polarity for this exact proposition,
        # then assert the assumption. This prevents a mere conflict from masquerading
        # as a counterfactual world.
        opposite = not assumption_fact.negated
        for fact in tuple(graph.facts()):
            if (
                fact.subject == assumption_fact.subject
                and fact.relation == assumption_fact.relation
                and fact.object == assumption_fact.object
                and fact.negated == opposite
            ):
                graph._facts.discard(fact)
                graph._by_relation.get(fact.relation, set()).discard(fact)

        graph._contradictions.clear()
        for a in graph.facts():
            for b in graph.facts():
                if (
                    a.subject, a.relation, a.object
                ) == (
                    b.subject, b.relation, b.object
                ) and a.negated != b.negated:
                    graph._contradictions.add((a.subject, a.relation, a.object))

        graph.add_fact(assumption_fact)
        sandbox_reasoning = ReasoningController(sandbox)
        after = sandbox_reasoning.reason(query)

        return CounterfactualResult(
            assumption_fact,
            query,
            before,
            after,
            before.status != after.status or abs(before.confidence - after.confidence) > 1e-9,
        )


__all__ = [
    "HypothesisKind",
    "Hypothesis",
    "HypothesisReport",
    "CounterfactualResult",
    "HypothesisController",
]

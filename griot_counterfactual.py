from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from griot_engine import Fact, GRIOT
from griot_reasoning_v040 import ReasoningEngine, ReasoningResult, TruthStatus
from griot_semantic_ir import SemanticGRIOT
from griot_worldmodel_v070 import CounterfactualResult as WorldCounterfactualResult, WorldModel


@dataclass(frozen=True, slots=True)
class CounterfactualScenario:
    assumption: Fact
    query: str
    before: ReasoningResult
    after: ReasoningResult
    baseline_world: WorldCounterfactualResult
    changed: bool
    added_facts: tuple[Fact, ...]
    removed_facts: tuple[Fact, ...]


class CounterfactualEngine:
    """Evaluate an intervention in an isolated clone of durable semantic memory."""

    def __init__(self, engine: GRIOT | None = None) -> None:
        self.engine = engine or GRIOT.create()
        self.reasoning = ReasoningEngine(SemanticGRIOT(self.engine))
        self.world = WorldModel(self.engine)

    def run(
        self,
        assumption_text: str,
        query: str,
        *,
        initial_world: Iterable[str] = (),
        steps: int = 8,
    ) -> CounterfactualScenario:
        assumption_gir = self.reasoning.semantic.understand(assumption_text)
        facts = tuple(
            fact
            for fact in assumption_gir.facts()
            if fact.relation in self.reasoning.QUERY_RELATIONS
        )
        if not facts:
            raise ValueError("assumption produced no supported semantic relation")
        assumption = facts[0]

        before = self.reasoning.reason(query)
        sandbox_engine = self._clone_engine()
        sandbox_graph = sandbox_engine.graph

        opposite = not assumption.negated
        removed = tuple(
            fact for fact in sandbox_graph.facts()
            if (
                fact.subject == assumption.subject
                and fact.relation == assumption.relation
                and fact.object == assumption.object
                and fact.negated == opposite
            )
        )
        for fact in removed:
            self._remove_fact(sandbox_graph, fact)

        sandbox_graph.add_fact(assumption)
        sandbox_reasoning = ReasoningEngine(SemanticGRIOT(sandbox_engine))
        after = sandbox_reasoning.reason(query)

        world_initial = tuple(initial_world) or (assumption.subject,)
        baseline_world = self.world.counterfactual(
            world_initial,
            remove=(assumption.subject,) if assumption.negated else (),
            add=() if assumption.negated else (assumption.subject,),
            steps=steps,
        )

        changed = before.status != after.status or abs(
            before.confidence - after.confidence
        ) > 1e-9

        return CounterfactualScenario(
            assumption,
            query,
            before,
            after,
            baseline_world,
            changed,
            (assumption,),
            removed,
        )

    @staticmethod
    def _remove_fact(graph: object, fact: Fact) -> None:
        if hasattr(graph, "_facts"):
            graph._facts.discard(fact)
        if hasattr(graph, "_by_relation"):
            graph._by_relation.get(fact.relation, set()).discard(fact)
        if hasattr(graph, "_contradictions"):
            key = (fact.subject, fact.relation, fact.object)
            if not any(
                (other.subject, other.relation, other.object) == key
                and other.negated != fact.negated
                for other in graph.facts()
            ):
                graph._contradictions.discard(key)

    def _clone_engine(self) -> GRIOT:
        clone = GRIOT.create(dimension=self.engine.kernel.dimension)
        builtin_symbols = {q.symbol for q in clone.quids.all()}
        builtin_codes = {q.code for q in clone.quids.all()}
        for quid in self.engine.quids.all():
            if quid.symbol in builtin_symbols or quid.code in builtin_codes:
                continue
            clone.quids.load((quid,))
        for fact in self.engine.graph.facts():
            clone.graph.add_fact(fact)
        for rule in getattr(self.engine.graph, "_rules", ()):
            if rule not in getattr(clone.graph, "_rules", ()):
                clone.graph._rules.append(rule)
        return clone


__all__ = ["CounterfactualEngine", "CounterfactualScenario"]

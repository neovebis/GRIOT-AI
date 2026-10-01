from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

from griot_engine import BaseLayer, GRIOT


@dataclass(frozen=True, slots=True)
class WorldState:
    active: frozenset[str]
    step: int


@dataclass(frozen=True, slots=True)
class WorldEvent:
    subject: str
    relation: str
    object: str
    step: int


@dataclass(frozen=True, slots=True)
class WorldTrace:
    initial: WorldState
    states: tuple[WorldState, ...]
    events: tuple[WorldEvent, ...]
    terminal: WorldState


@dataclass(frozen=True, slots=True)
class CounterfactualResult:
    baseline: WorldTrace
    intervention: WorldTrace
    changed: bool


@dataclass(frozen=True, slots=True)
class CausalPlan:
    goal: str
    prerequisites: tuple[tuple[str, ...], ...]
    depth: int


class WorldModel:
    """Transient causal world model backed by GRIOT's durable causal facts."""

    def __init__(self, engine: GRIOT) -> None:
        self.engine = engine

    def simulate(self, initial: Iterable[str], *, steps: int = 8) -> WorldTrace:
        if steps < 0:
            raise ValueError("steps must be >= 0")
        initial_active = frozenset(self._resolve_many(initial))
        state = WorldState(initial_active, 0)
        states = [state]
        events: list[WorldEvent] = []

        for step in range(1, steps + 1):
            additions: set[str] = set()
            for fact in self.engine.graph.facts():
                if fact.negated or fact.relation != "causes":
                    continue
                if fact.subject in state.active and fact.object not in state.active:
                    additions.add(fact.object)
                    events.append(
                        WorldEvent(fact.subject, fact.relation, fact.object, step)
                    )
            if not additions:
                break
            state = WorldState(frozenset(set(state.active) | additions), step)
            states.append(state)

        return WorldTrace(
            states[0],
            tuple(states),
            tuple(events),
            states[-1],
        )

    def counterfactual(
        self,
        initial: Iterable[str],
        *,
        remove: Iterable[str] = (),
        add: Iterable[str] = (),
        steps: int = 8,
    ) -> CounterfactualResult:
        base_symbols = set(self._resolve_many(initial))
        baseline = self.simulate(base_symbols, steps=steps)

        removed = set(self._resolve_many(remove))
        added = set(self._resolve_many(add))
        intervention_initial = frozenset((base_symbols - removed) | added)
        intervention = self.simulate(intervention_initial, steps=steps)
        return CounterfactualResult(
            baseline,
            intervention,
            baseline.terminal.active != intervention.terminal.active,
        )

    def plan(self, goal: str, *, max_depth: int = 8) -> CausalPlan:
        if max_depth < 0:
            raise ValueError("max_depth must be >= 0")
        goal_symbol = self._resolve(goal)
        graph: dict[str, set[str]] = {}
        for fact in self.engine.graph.facts():
            if fact.negated or fact.relation != "causes":
                continue
            graph.setdefault(fact.object, set()).add(fact.subject)

        paths: list[tuple[str, ...]] = []

        def visit(target: str, path: tuple[str, ...], depth: int) -> None:
            if depth > max_depth:
                return
            predecessors = sorted(graph.get(target, ()))
            if not predecessors:
                paths.append(path + (target,))
                return
            for predecessor in predecessors:
                if predecessor in path:
                    continue
                visit(predecessor, (predecessor,) + path, depth + 1)

        visit(goal_symbol, (), 0)
        depth = max((len(path) - 1 for path in paths), default=0)
        return CausalPlan(goal_symbol, tuple(sorted(set(paths))), depth)

    def labels(self, state: WorldState) -> tuple[str, ...]:
        labels: list[str] = []
        for symbol in sorted(state.active):
            quid = self.engine.quids.get(symbol)
            labels.append(quid.label if quid is not None else symbol)
        return tuple(labels)

    def _resolve_many(self, values: Iterable[str]) -> tuple[str, ...]:
        return tuple(self._resolve(value) for value in values)

    def _resolve(self, value: str) -> str:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("world entity must be a non-empty string")
        q = self.engine.quids.get(value)
        if q is None:
            q = self.engine.quids.ensure(
                value.strip(),
                base=BaseLayer.RICH,
                family_id=1,
            )
        return q.symbol


__all__ = [
    "CausalPlan",
    "CounterfactualResult",
    "WorldEvent",
    "WorldModel",
    "WorldState",
    "WorldTrace",
]

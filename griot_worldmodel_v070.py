from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Iterable

from griot_engine import Fact, GRIOT


@dataclass(frozen=True, slots=True)
class WorldState:
    """Transient world state represented by active QUID symbols."""

    active: frozenset[str]
    step: int = 0


@dataclass(frozen=True, slots=True)
class TransitionEvent:
    """One causal transition observed during simulation."""

    cause: str
    effect: str
    step: int
    confidence: float
    provenance: str


@dataclass(frozen=True, slots=True)
class SimulationTrace:
    states: tuple[WorldState, ...]
    events: tuple[TransitionEvent, ...]
    terminal: WorldState

    @property
    def initial(self) -> WorldState:
        return self.states[0]


@dataclass(frozen=True, slots=True)
class CounterfactualTrace:
    baseline: SimulationTrace
    intervention: SimulationTrace
    added: frozenset[str]
    removed: frozenset[str]
    changed: bool


@dataclass(frozen=True, slots=True)
class CausalPlan:
    target: str
    depth: int
    prerequisites: tuple[tuple[str, ...], ...]


class WorldModel:
    """Deterministic transient causal world model.

    Positive causes facts are treated as one-way transition rules:
    if the cause is active, the effect may become active in the next state.
    Simulation never mutates durable graph memory.
    """

    def __init__(self, engine: GRIOT) -> None:
        self.engine = engine

    def labels(self, state: WorldState) -> tuple[str, ...]:
        labels = []
        for symbol in sorted(state.active):
            q = self.engine.quids.get(symbol)
            labels.append(q.label if q else symbol)
        return tuple(labels)

    def simulate(
        self,
        initial: Iterable[str],
        *,
        steps: int = 8,
    ) -> SimulationTrace:
        if steps < 0:
            raise ValueError("steps must be >= 0")

        active = frozenset(self._resolve(value) for value in initial)
        states = [WorldState(active, 0)]
        events: list[TransitionEvent] = []

        edges = self._causal_edges()

        for step in range(1, steps + 1):
            additions: dict[str, Fact] = {}
            for fact in edges:
                if fact.subject in active and fact.object not in active:
                    current = additions.get(fact.object)
                    if current is None or fact.confidence > current.confidence:
                        additions[fact.object] = fact

            if not additions:
                break

            next_active = frozenset(set(active) | set(additions))
            for effect, fact in sorted(additions.items()):
                events.append(
                    TransitionEvent(
                        cause=fact.subject,
                        effect=effect,
                        step=step,
                        confidence=fact.confidence,
                        provenance=fact.provenance,
                    )
                )

            state = WorldState(next_active, step)
            states.append(state)
            active = next_active

        return SimulationTrace(tuple(states), tuple(events), states[-1])

    def counterfactual(
        self,
        initial: Iterable[str],
        *,
        add: Iterable[str] = (),
        remove: Iterable[str] = (),
        steps: int = 8,
    ) -> CounterfactualTrace:
        original = frozenset(self._resolve(value) for value in initial)
        additions = frozenset(self._resolve(value) for value in add)
        removals = frozenset(self._resolve(value) for value in remove)
        intervention_initial = frozenset((set(original) - set(removals)) | set(additions))

        baseline = self.simulate(original, steps=steps)
        intervention = self.simulate(intervention_initial, steps=steps)

        return CounterfactualTrace(
            baseline=baseline,
            intervention=intervention,
            added=additions,
            removed=removals,
            changed=baseline.terminal.active != intervention.terminal.active,
        )

    def plan(self, target: str, *, max_depth: int = 8) -> CausalPlan:
        if max_depth < 0:
            raise ValueError("max_depth must be >= 0")

        target_symbol = self._resolve(target)
        reverse: dict[str, set[str]] = {}
        for fact in self._causal_edges():
            reverse.setdefault(fact.object, set()).add(fact.subject)

        paths: set[tuple[str, ...]] = set()
        queue: deque[tuple[str, tuple[str, ...], int]] = deque(
            [(target_symbol, (target_symbol,), 0)]
        )
        best_depth: dict[str, int] = {target_symbol: 0}

        while queue:
            current, backwards_path, depth = queue.popleft()
            if depth >= max_depth:
                paths.add(tuple(reversed(backwards_path)))
                continue

            parents = sorted(reverse.get(current, ()))
            if not parents:
                paths.add(tuple(reversed(backwards_path)))
                continue

            expanded = False
            for parent in parents:
                if parent in backwards_path:
                    continue
                expanded = True
                new_depth = depth + 1
                existing = best_depth.get(parent)
                if existing is not None and existing < new_depth:
                    continue
                best_depth[parent] = new_depth
                queue.append((parent, backwards_path + (parent,), new_depth))
            if not expanded:
                paths.add(tuple(reversed(backwards_path)))

        ordered = tuple(sorted(paths, key=lambda path: (len(path), path)))
        depth = max((len(path) - 1 for path in ordered), default=0)
        return CausalPlan(target=target_symbol, depth=depth, prerequisites=ordered)

    def _causal_edges(self) -> tuple[Fact, ...]:
        return tuple(
            sorted(
                (
                    fact
                    for fact in self.engine.graph.facts()
                    if fact.relation == "causes" and not fact.negated
                ),
                key=lambda f: (f.subject, f.object, -f.confidence, f.provenance),
            )
        )

    def _resolve(self, value: str) -> str:
        q = self.engine.quids.get(value)
        return q.symbol if q else self.engine.quids.ensure(value).symbol


__all__ = [
    "WorldState",
    "TransitionEvent",
    "SimulationTrace",
    "CounterfactualTrace",
    "CausalPlan",
    "WorldModel",
]

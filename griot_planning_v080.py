from __future__ import annotations

import heapq
from dataclasses import dataclass
from itertools import count
from typing import Iterable

from griot_engine import BaseLayer, GRIOT
from griot_worldmodel_v070 import WorldModel, WorldState


@dataclass(frozen=True, slots=True)
class ActionSchema:
    action_quid: str
    label: str
    preconditions: frozenset[str]
    add_effects: frozenset[str]
    remove_effects: frozenset[str] = frozenset()
    cost: float = 1.0
    confidence: float = 1.0
    provenance: str = "planner"


@dataclass(frozen=True, slots=True)
class PlanStep:
    action: ActionSchema
    before: WorldState
    after: WorldState


@dataclass(frozen=True, slots=True)
class ActionPlan:
    initial: WorldState
    goal: frozenset[str]
    steps: tuple[PlanStep, ...]
    final: WorldState
    total_cost: float
    verified: bool


class GoalPlanner:
    """
    Symbolic goal planner over QUID world states.

    Action schemas are explicit. The planner never invents durable facts:
    it searches over transient states, and each action application is verified.
    """

    def __init__(self, engine: GRIOT, *, causal_steps: int = 8) -> None:
        if causal_steps < 0:
            raise ValueError("causal_steps must be >= 0")
        self.engine = engine
        self.world = WorldModel(engine)
        self.causal_steps = causal_steps
        self._actions: dict[str, ActionSchema] = {}

    def register_action(
        self,
        label: str,
        *,
        preconditions: Iterable[str] = (),
        add_effects: Iterable[str] = (),
        remove_effects: Iterable[str] = (),
        cost: float = 1.0,
        confidence: float = 1.0,
        provenance: str = "planner",
    ) -> ActionSchema:
        if cost <= 0:
            raise ValueError("cost must be > 0")
        if not 0.0 <= confidence <= 1.0:
            raise ValueError("confidence must be between 0 and 1")

        q = self.engine.quids.ensure(label, base=BaseLayer.SCENE, family_id=4)
        action = ActionSchema(
            q.symbol,
            label,
            frozenset(self._resolve(x) for x in preconditions),
            frozenset(self._resolve(x) for x in add_effects),
            frozenset(self._resolve(x) for x in remove_effects),
            float(cost),
            float(confidence),
            provenance,
        )
        self._actions[q.symbol] = action
        return action

    def actions(self) -> tuple[ActionSchema, ...]:
        return tuple(sorted(self._actions.values(), key=lambda x: x.label))

    def plan(
        self,
        initial: Iterable[str],
        goal: str | Iterable[str],
        *,
        max_depth: int = 8,
    ) -> ActionPlan | None:
        if max_depth < 0:
            raise ValueError("max_depth must be >= 0")
        initial_state = WorldState(frozenset(self._resolve(x) for x in initial), 0)
        goal_set = frozenset(self._resolve(x) for x in (goal,) if isinstance(goal, str))
        if not goal_set:
            goal_set = frozenset(self._resolve(x) for x in goal)  # type: ignore[arg-type]

        if goal_set <= initial_state.active:
            return ActionPlan(initial_state, goal_set, (), initial_state, 0.0, True)

        queue: list[tuple[float, int, int, WorldState, tuple[ActionSchema, ...]]] = []
        serial = count()
        heapq.heappush(queue, (0.0, 0, next(serial), initial_state, ()))
        best_cost: dict[frozenset[str], float] = {initial_state.active: 0.0}
        actions = self.actions()

        while queue:
            cost, depth, _, state, path = heapq.heappop(queue)
            if cost > best_cost.get(state.active, float("inf")) + 1e-12:
                continue
            if goal_set <= state.active:
                return self._materialize(initial_state, goal_set, path)

            if depth >= max_depth:
                continue

            for action in actions:
                if not action.preconditions <= state.active:
                    continue
                if action.remove_effects & action.add_effects:
                    continue

                direct_active = (set(state.active) - set(action.remove_effects)) | set(action.add_effects)
                causal_trace = self.world.simulate(self._labels_to_text(direct_active), steps=self.causal_steps)
                next_active = causal_trace.terminal.active
                next_state = WorldState(next_active, depth + 1)
                next_cost = cost + action.cost
                if next_cost + 1e-12 >= best_cost.get(next_active, float("inf")):
                    continue
                best_cost[next_active] = next_cost
                heapq.heappush(queue, (next_cost, depth + 1, next(serial), next_state, path + (action,)))

        return None

    def verify(self, plan: ActionPlan) -> bool:
        current = plan.initial
        for index, action in enumerate(plan.steps, start=1):
            if not action.action.preconditions <= current.active:
                return False
            direct = (set(current.active) - set(action.action.remove_effects)) | set(action.action.add_effects)
            propagated = self.world.simulate(self._labels_to_text(direct), steps=self.causal_steps)
            current = WorldState(propagated.terminal.active, index)
        return current.active == plan.final.active and plan.goal <= current.active and abs(plan.total_cost - sum(s.action.cost for s in plan.steps)) < 1e-9

    def labels(self, state: WorldState) -> tuple[str, ...]:
        return self.world.labels(state)

    def _materialize(self, initial: WorldState, goal: frozenset[str], actions: tuple[ActionSchema, ...]) -> ActionPlan:
        current = initial
        steps: list[PlanStep] = []
        for action in actions:
            before = current
            direct = (set(current.active) - set(action.remove_effects)) | set(action.add_effects)
            propagated = self.world.simulate(self._labels_to_text(direct), steps=self.causal_steps)
            current = WorldState(propagated.terminal.active, before.step + 1)
            steps.append(PlanStep(action, before, current))
        plan = ActionPlan(initial, goal, tuple(steps), current, sum(a.cost for a in actions), False)
        return ActionPlan(plan.initial, plan.goal, plan.steps, plan.final, plan.total_cost, self.verify(plan))

    def _labels_to_text(self, symbols: Iterable[str]) -> tuple[str, ...]:
        return tuple(
            self.engine.quids.get(symbol).label
            if self.engine.quids.get(symbol)
            else symbol
            for symbol in symbols
        )

    def _resolve(self, value: str) -> str:
        q = self.engine.quids.get(value)
        return q.symbol if q else self.engine.quids.ensure(value).symbol


__all__ = ["ActionSchema", "PlanStep", "ActionPlan", "GoalPlanner"]

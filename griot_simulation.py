from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Mapping, Sequence

from griot_engine import GRIOT, TransitionRule


@dataclass(frozen=True, slots=True)
class SimulationState:
    step: int
    values: tuple[tuple[str, float], ...]


@dataclass(frozen=True, slots=True)
class SimulationResult:
    initial: tuple[tuple[str, float], ...]
    states: tuple[SimulationState, ...]
    terminal: tuple[tuple[str, float], ...]
    rule_counts: tuple[tuple[str, int], ...]
    steps_executed: int

    @property
    def terminal_map(self) -> dict[str, float]:
        return dict(self.terminal)


@dataclass(frozen=True, slots=True)
class MonteCarloResult:
    runs: int
    steps: int
    seed: int
    mean: float
    variance: float
    minimum: float
    maximum: float


class SimulationEngine:
    """Immutable facade over GRIOT's deterministic/Monte Carlo simulator."""

    def __init__(self, engine: GRIOT | None = None) -> None:
        self.engine = engine or GRIOT.create()

    def run(
        self,
        initial: Mapping[str, float],
        rules: Sequence[TransitionRule],
        *,
        steps: int,
    ) -> SimulationResult:
        normalized = {str(key): float(value) for key, value in initial.items()}
        rule_tuple = tuple(rules)
        raw = self.engine.simulator.run(normalized, rule_tuple, steps)

        states = tuple(
            SimulationState(
                index,
                tuple(sorted((str(key), float(value)) for key, value in state.items())),
            )
            for index, state in enumerate(raw["states"])
        )
        terminal = tuple(sorted((str(key), float(value)) for key, value in raw["terminal"].items()))
        counts = tuple(
            sorted(
                (rule.name, int(raw["metrics"].get(f"rule:{rule.name}", 0.0)))
                for rule in rule_tuple
            )
        )
        return SimulationResult(
            tuple(sorted(normalized.items())),
            states,
            terminal,
            counts,
            int(raw["metrics"]["steps_executed"]),
        )

    def monte_carlo(
        self,
        initial: Mapping[str, float],
        transition: Callable[[dict[str, float], object], None],
        *,
        steps: int,
        runs: int,
        seed: int = 0,
        metric: Callable[[Mapping[str, float]], float] | None = None,
    ) -> MonteCarloResult:
        raw = self.engine.simulator.monte_carlo(
            {str(key): float(value) for key, value in initial.items()},
            transition,
            steps=steps,
            runs=runs,
            seed=seed,
            metric=metric,
        )
        return MonteCarloResult(
            runs,
            steps,
            seed,
            float(raw["mean"]),
            float(raw["variance"]),
            float(raw["min"]),
            float(raw["max"]),
        )


__all__ = ["MonteCarloResult", "SimulationEngine", "SimulationResult", "SimulationState"]

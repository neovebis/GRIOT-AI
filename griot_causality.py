from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Iterable

from griot_engine import Fact, GRIOT


@dataclass(frozen=True, slots=True)
class CausalStep:
    subject: str
    relation: str
    object: str
    confidence: float
    provenance: str


@dataclass(frozen=True, slots=True)
class CausalPath:
    nodes: tuple[str, ...]
    steps: tuple[CausalStep, ...]
    confidence: float

    @property
    def depth(self) -> int:
        return len(self.steps)


@dataclass(frozen=True, slots=True)
class CausalAnalysis:
    target: str
    direction: str
    paths: tuple[CausalPath, ...]
    direct: tuple[CausalStep, ...]
    cycles: tuple[tuple[str, ...], ...]

    @property
    def max_depth(self) -> int:
        return max((path.depth for path in self.paths), default=0)


class CausalityEngine:
    """Explicit causal traversal over durable graph facts."""

    def __init__(self, engine: GRIOT | None = None) -> None:
        self.engine = engine or GRIOT.create()

    def causes_of(self, target: str, *, max_depth: int = 8) -> CausalAnalysis:
        return self.analyze(target, direction="causes", max_depth=max_depth)

    def effects_of(self, source: str, *, max_depth: int = 8) -> CausalAnalysis:
        return self.analyze(source, direction="effects", max_depth=max_depth)

    def analyze(
        self,
        target: str,
        *,
        direction: str = "causes",
        max_depth: int = 8,
    ) -> CausalAnalysis:
        if direction not in {"causes", "effects"}:
            raise ValueError("direction must be 'causes' or 'effects'")
        if max_depth < 0:
            raise ValueError("max_depth must be >= 0")

        start = self._resolve(target)
        facts = [
            fact for fact in self.engine.graph.facts()
            if fact.relation == "causes" and not fact.negated
        ]

        adjacency: dict[str, list[Fact]] = {}
        for fact in facts:
            key = fact.object if direction == "causes" else fact.subject
            adjacency.setdefault(key, []).append(fact)

        for values in adjacency.values():
            values.sort(key=lambda fact: (fact.subject, fact.object, fact.provenance))

        direct = tuple(
            self._step(fact)
            for fact in facts
            if (
                (direction == "causes" and fact.object == start)
                or (direction == "effects" and fact.subject == start)
            )
        )

        paths: list[CausalPath] = []
        cycle_paths: set[tuple[str, ...]] = set()

        def visit(node: str, path_nodes: tuple[str, ...], steps: tuple[CausalStep, ...]) -> None:
            if len(steps) >= max_depth:
                if steps:
                    paths.append(
                        CausalPath(
                            path_nodes,
                            steps,
                            self._path_confidence(steps),
                        )
                    )
                return

            outgoing = adjacency.get(node, ())
            if not outgoing:
                if steps:
                    paths.append(
                        CausalPath(
                            path_nodes,
                            steps,
                            self._path_confidence(steps),
                        )
                    )
                return

            for fact in outgoing:
                next_node = fact.subject if direction == "causes" else fact.object
                step = self._step(fact)
                if next_node in path_nodes:
                    cycle_paths.add(path_nodes + (next_node,))
                    if steps:
                        paths.append(
                            CausalPath(
                                path_nodes + (next_node,),
                                steps + (step,),
                                self._path_confidence(steps + (step,)),
                            )
                        )
                    continue
                visit(
                    next_node,
                    path_nodes + (next_node,),
                    steps + (step,),
                )

        visit(start, (start,), ())

        unique: dict[tuple[tuple[str, ...], tuple[tuple[str, str, str], ...]], CausalPath] = {}
        for path in paths:
            key = (
                path.nodes,
                tuple((step.subject, step.relation, step.object) for step in path.steps),
            )
            current = unique.get(key)
            if current is None or path.confidence > current.confidence:
                unique[key] = path

        ordered = sorted(
            unique.values(),
            key=lambda path: (path.depth, -path.confidence, path.nodes),
        )
        return CausalAnalysis(
            start,
            direction,
            tuple(ordered),
            tuple(sorted(direct, key=lambda step: (step.subject, step.object, step.provenance))),
            tuple(sorted(cycle_paths)),
        )

    def reachable(self, source: str, target: str, *, max_depth: int = 8) -> bool:
        analysis = self.effects_of(source, max_depth=max_depth)
        target_symbol = self._resolve(target)
        return any(
            path.nodes and path.nodes[-1] == target_symbol
            for path in analysis.paths
        )

    def _resolve(self, value: str) -> str:
        quid = self.engine.quids.get(value)
        if quid is None:
            raise KeyError(f"unknown QUID entity: {value}")
        return quid.symbol

    @staticmethod
    def _step(fact: Fact) -> CausalStep:
        return CausalStep(
            fact.subject,
            fact.relation,
            fact.object,
            float(fact.confidence),
            fact.provenance,
        )

    @staticmethod
    def _path_confidence(steps: Iterable[CausalStep]) -> float:
        values = tuple(float(step.confidence) for step in steps)
        if not values:
            return 0.0
        return max(0.0, min(1.0, math.prod(values) * (0.92 ** max(0, len(values) - 1))))


__all__ = ["CausalAnalysis", "CausalPath", "CausalStep", "CausalityEngine"]

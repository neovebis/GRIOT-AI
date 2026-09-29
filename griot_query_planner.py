from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Iterable, TYPE_CHECKING

from griot_context import ContextView
from griot_gir import GIR
from griot_working_graph import WorkingGraph, WorkingGraphState
from griot_engine import Fact, Inference

if TYPE_CHECKING:
    from griot_engine import GRIOT


QUERY_RELATIONS = frozenset({
    "is_a", "part_of", "member_of", "has", "causes", "before", "after",
    "located_in", "attacks", "eats", "sees", "uses", "builds", "creates",
    "helps", "hurts", "wants", "needs", "knows", "believes",
})


@dataclass(frozen=True, slots=True)
class QueryTarget:
    subject: str
    relation: str
    object: str
    negated: bool = False

    def key(self) -> tuple[object, ...]:
        return (self.subject, self.relation, self.object, self.negated)


@dataclass(frozen=True, slots=True)
class QueryPlan:
    gir_fingerprint: str
    targets: tuple[QueryTarget, ...]
    context_record_ids: tuple[int, ...]
    max_evidence: int
    strategies: tuple[str, ...]
    fingerprint: str

    def __post_init__(self) -> None:
        if not self.gir_fingerprint:
            raise ValueError("gir_fingerprint must be non-empty")
        if self.max_evidence <= 0:
            raise ValueError("max_evidence must be positive")
        if tuple(sorted(self.targets, key=lambda t: t.key())) != self.targets:
            raise ValueError("QueryPlan targets must be canonically ordered")
        if tuple(sorted(set(self.context_record_ids))) != self.context_record_ids:
            raise ValueError("QueryPlan context_record_ids must be ordered and unique")
        if not self.fingerprint:
            raise ValueError("QueryPlan fingerprint must be non-empty")


@dataclass(frozen=True, slots=True)
class QueryExecution:
    plan: QueryPlan
    working_graph: WorkingGraphState


class QueryPlanner:
    """Deterministic retrieval planner between GIR/context and Working Graph."""

    def __init__(self, engine: GRIOT, max_evidence: int = 256, max_context_records: int = 8) -> None:
        if max_evidence <= 0:
            raise ValueError("max_evidence must be positive")
        if max_context_records <= 0:
            raise ValueError("max_context_records must be positive")
        self.engine = engine
        self.max_evidence = max_evidence
        self.max_context_records = max_context_records

    def plan(self, gir: GIR, context: ContextView | None = None) -> QueryPlan:
        gir.validate()
        nodes = {node.node_id: node for node in gir.nodes}
        targets: list[QueryTarget] = []

        for edge in gir.edges:
            if edge.relation not in QUERY_RELATIONS:
                continue
            source = nodes.get(edge.source)
            target = nodes.get(edge.target)
            if source is None or target is None:
                continue
            targets.append(QueryTarget(source.quid, edge.relation, target.quid, edge.negated))

        targets = sorted(set(targets), key=lambda target: target.key())
        context_ids: tuple[int, ...] = ()
        if context is not None:
            context_ids = tuple(
                match.record_id
                for match in context.matches[: self.max_context_records]
            )

        strategies = ["current_gir"]
        if targets:
            strategies.append("exact_durable_evidence")
            strategies.append("rule_inference")
        if context_ids:
            strategies.append("selected_context_records")

        payload = {
            "gir": gir.fingerprint(),
            "targets": [target.key() for target in targets],
            "context": list(context_ids),
            "max_evidence": self.max_evidence,
            "strategies": strategies,
        }
        fingerprint = hashlib.sha256(
            json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()

        return QueryPlan(
            gir.fingerprint(),
            tuple(targets),
            tuple(sorted(set(context_ids))),
            self.max_evidence,
            tuple(strategies),
            fingerprint,
        )

    def execute(self, plan: QueryPlan, gir: GIR, context: ContextView | None = None) -> QueryExecution:
        gir.validate()
        if plan.gir_fingerprint != gir.fingerprint():
            raise ValueError("QueryPlan does not match the supplied GIR")

        working = WorkingGraph(max_evidence=plan.max_evidence)
        working.extend(gir.facts(), origin="current-gir", score=1.0)

        for target in plan.targets:
            direct = [
                fact for fact in self.engine.graph.facts()
                if fact.subject == target.subject
                and fact.relation == target.relation
                and fact.object == target.object
            ]
            working.extend(direct, origin="durable-direct", score=0.98)

            inferred = [
                item for item in self.engine.graph.query(
                    target.subject, target.relation, target.object
                )
                if isinstance(item, Inference)
            ]
            working.extend(inferred, origin="durable-inference", score=0.90)
            for inference in inferred:
                working.extend(
                    inference.support,
                    origin="durable-support",
                    score=0.86,
                )

        if context is not None:
            selected = set(plan.context_record_ids)
            for match in context.matches:
                if match.record_id not in selected:
                    continue
                record = self.engine.context.get(match.record_id)
                if record is None:
                    continue
                working.extend(
                    record.gir.facts(),
                    origin=f"context:{record.record_id}",
                    score=max(0.0, min(1.0, match.score / 10.0)),
                )

        return QueryExecution(plan, working.state())


__all__ = [
    "QUERY_RELATIONS",
    "QueryExecution",
    "QueryPlan",
    "QueryPlanner",
    "QueryTarget",
]

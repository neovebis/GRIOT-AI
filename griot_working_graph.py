from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from typing import Iterable

from griot_engine import Fact, Inference


@dataclass(frozen=True, slots=True)
class WorkingEvidence:
    evidence_id: int
    item: Fact | Inference
    origin: str
    score: float = 1.0


@dataclass(frozen=True, slots=True)
class WorkingGraphState:
    evidence_count: int
    direct_count: int
    inference_count: int
    quids: tuple[str, ...]
    sources: tuple[str, ...]


class WorkingGraph:
    """Bounded transient evidence graph for one reasoning cycle.

    WorkingGraph contains only retrieved/compiled evidence for the current
    task. It never mutates durable graph memory and can be discarded after the
    reasoning cycle.
    """

    def __init__(self, max_evidence: int = 256) -> None:
        if not isinstance(max_evidence, int) or isinstance(max_evidence, bool) or max_evidence <= 0:
            raise ValueError("max_evidence must be a positive integer")
        self.max_evidence = max_evidence
        self._entries: OrderedDict[tuple[object, ...], WorkingEvidence] = OrderedDict()
        self._next_id = 1

    def clear(self) -> None:
        self._entries.clear()
        self._next_id = 1

    def __len__(self) -> int:
        return len(self._entries)

    def add(self, item: Fact | Inference, *, origin: str, score: float = 1.0) -> WorkingEvidence:
        if not isinstance(item, (Fact, Inference)):
            raise TypeError("WorkingGraph evidence must be Fact or Inference")
        if not isinstance(origin, str) or not origin.strip():
            raise ValueError("origin must be a non-empty string")
        if not 0.0 <= float(score) <= 1.0:
            raise ValueError("score must be in 0..1")

        key = self._key(item)
        existing = self._entries.get(key)
        if existing is not None:
            if score > existing.score:
                self._entries[key] = WorkingEvidence(
                    existing.evidence_id, existing.item, origin, float(score)
                )
            return self._entries[key]

        entry = WorkingEvidence(self._next_id, item, origin.strip(), float(score))
        self._next_id += 1
        self._entries[key] = entry
        while len(self._entries) > self.max_evidence:
            self._entries.popitem(last=False)
        return entry

    def extend(self, items: Iterable[Fact | Inference], *, origin: str, score: float = 1.0) -> tuple[WorkingEvidence, ...]:
        return tuple(self.add(item, origin=origin, score=score) for item in items)

    def evidence(self) -> tuple[WorkingEvidence, ...]:
        return tuple(
            sorted(
                self._entries.values(),
                key=lambda entry: (-entry.score, entry.evidence_id),
            )
        )

    def direct(self) -> tuple[WorkingEvidence, ...]:
        return tuple(entry for entry in self.evidence() if isinstance(entry.item, Fact))

    def inferences(self) -> tuple[WorkingEvidence, ...]:
        return tuple(entry for entry in self.evidence() if isinstance(entry.item, Inference))

    def facts(self) -> tuple[Fact, ...]:
        return tuple(entry.item for entry in self.direct())

    def query(self, subject: str | None = None, relation: str | None = None, object_: str | None = None) -> tuple[WorkingEvidence, ...]:
        out = []
        for entry in self.evidence():
            fact = entry.item if isinstance(entry.item, Fact) else entry.item.fact
            if subject is not None and fact.subject != subject:
                continue
            if relation is not None and fact.relation != relation:
                continue
            if object_ is not None and fact.object != object_:
                continue
            out.append(entry)
        return tuple(out)

    def build(
        self,
        gir: object,
        *,
        context: object | None = None,
        durable_graph: object | None = None,
    ) -> WorkingGraphState:
        if not hasattr(gir, "validate") or not hasattr(gir, "facts") or not hasattr(gir, "edges"):
            raise TypeError("gir must be a GIR-compatible object")
        gir.validate()
        self.clear()

        # Current semantic facts are the first-class working hypotheses.
        self.extend(gir.facts(), origin="current-gir", score=1.0)

        # Pull exact durable evidence for query relations, preserving all
        # direct-source facts and rule-derived inferences.
        if durable_graph is not None and hasattr(durable_graph, "facts") and hasattr(durable_graph, "query"):
            nodes = {node.node_id: node for node in gir.nodes}
            for edge in gir.edges:
                if edge.relation not in {
                    "is_a", "part_of", "member_of", "has", "causes",
                    "before", "after", "located_in", "attacks", "eats",
                    "sees", "uses", "builds", "creates", "helps", "hurts",
                    "wants", "needs", "knows", "believes",
                }:
                    continue
                source = nodes.get(edge.source)
                target = nodes.get(edge.target)
                if source is None or target is None:
                    continue
                direct = [
                    fact for fact in durable_graph.facts()
                    if fact.subject == source.quid
                    and fact.relation == edge.relation
                    and fact.object == target.quid
                ]
                self.extend(direct, origin="durable-direct", score=0.98)
                inferred = [
                    item for item in durable_graph.query(source.quid, edge.relation, target.quid)
                    if isinstance(item, Inference)
                ]
                self.extend(inferred, origin="durable-inference", score=0.90)

        if context is not None and hasattr(context, "matches") and hasattr(context, "_records"):
            # ContextView deliberately exposes record IDs rather than mutable
            # records. Resolve them only through a supplied record lookup.
            pass

        return self.state()

    def state(self) -> WorkingGraphState:
        items = self.evidence()
        quids: set[str] = set()
        sources: set[str] = set()
        for entry in items:
            fact = entry.item if isinstance(entry.item, Fact) else entry.item.fact
            quids.update((fact.subject, fact.object))
            if fact.provenance:
                sources.add(fact.provenance)
        return WorkingGraphState(
            evidence_count=len(items),
            direct_count=sum(isinstance(entry.item, Fact) for entry in items),
            inference_count=sum(isinstance(entry.item, Inference) for entry in items),
            quids=tuple(sorted(quids)),
            sources=tuple(sorted(sources)),
        )

    @staticmethod
    def _key(item: Fact | Inference) -> tuple[object, ...]:
        if isinstance(item, Inference):
            fact = item.fact
            support_key = tuple(
                (f.subject, f.relation, f.object, f.negated, f.provenance)
                for f in item.support
            )
            return (
                "inference",
                fact.subject,
                fact.relation,
                fact.object,
                fact.negated,
                item.rule,
                item.confidence,
                support_key,
            )
        return (
            "fact",
            item.subject,
            item.relation,
            item.object,
            item.negated,
            item.provenance,
            item.evidence,
            item.confidence,
        )


__all__ = ["WorkingEvidence", "WorkingGraph", "WorkingGraphState"]

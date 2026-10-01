from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Iterable

from griot_engine import Fact, Inference
from griot_working_graph import WorkingEvidence, WorkingGraph, WorkingGraphState


@dataclass(frozen=True, slots=True)
class DistributedWorkingGraphState:
    workers: tuple[WorkingGraphState, ...]
    evidence_count: int
    direct_count: int
    inference_count: int
    sources: tuple[str, ...]


class DistributedWorkingGraph:
    """Deterministic local worker partitioning for Working Graph evidence.

    E5 models the distributed contract in-process. Network transport, remote
    process scheduling and failure recovery are intentionally deferred to later
    infrastructure hardening.
    """

    def __init__(self, workers: int = 4, max_evidence_per_worker: int = 256) -> None:
        if workers <= 0:
            raise ValueError("workers must be positive")
        self.workers = workers
        self._graphs = tuple(
            WorkingGraph(max_evidence=max_evidence_per_worker)
            for _ in range(workers)
        )

    def clear(self) -> None:
        for graph in self._graphs:
            graph.clear()

    def worker_for(self, evidence: Fact | Inference) -> int:
        fact = evidence if isinstance(evidence, Fact) else evidence.fact
        material = f"{fact.subject}|{fact.relation}|{fact.object}"
        digest = hashlib.sha256(material.encode("utf-8")).digest()
        return int.from_bytes(digest[:8], "big") % self.workers

    def add(
        self,
        evidence: Fact | Inference,
        *,
        origin: str,
        score: float = 1.0,
    ) -> WorkingEvidence:
        return self._graphs[self.worker_for(evidence)].add(
            evidence,
            origin=origin,
            score=score,
        )

    def extend(
        self,
        evidence: Iterable[Fact | Inference],
        *,
        origin: str,
        score: float = 1.0,
    ) -> tuple[WorkingEvidence, ...]:
        return tuple(
            self.add(item, origin=origin, score=score)
            for item in evidence
        )

    def query(
        self,
        *,
        subject: str | None = None,
        relation: str | None = None,
        object_: str | None = None,
    ) -> tuple[WorkingEvidence, ...]:
        matches: list[WorkingEvidence] = []
        for graph in self._graphs:
            matches.extend(
                graph.query(
                    subject=subject,
                    relation=relation,
                    object_=object_,
                )
            )
        return tuple(
            sorted(matches, key=lambda entry: (-entry.score, entry.evidence_id))
        )

    def evidence(self) -> tuple[WorkingEvidence, ...]:
        values = [
            entry
            for graph in self._graphs
            for entry in graph.evidence()
        ]
        return tuple(
            sorted(
                values,
                key=lambda entry: (
                    -entry.score,
                    self.worker_for(entry.item),
                    entry.evidence_id,
                ),
            )
        )

    def state(self) -> DistributedWorkingGraphState:
        states = tuple(graph.state() for graph in self._graphs)
        return DistributedWorkingGraphState(
            workers=states,
            evidence_count=sum(state.evidence_count for state in states),
            direct_count=sum(state.direct_count for state in states),
            inference_count=sum(state.inference_count for state in states),
            sources=tuple(sorted({source for state in states for source in state.sources})),
        )

    def worker_state(self, worker_id: int) -> WorkingGraphState:
        if not 0 <= worker_id < self.workers:
            raise IndexError("worker_id out of range")
        return self._graphs[worker_id].state()


__all__ = ["DistributedWorkingGraph", "DistributedWorkingGraphState"]

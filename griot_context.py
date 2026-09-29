from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from griot_gir import GIR


@dataclass(frozen=True, slots=True)
class ContextRecord:
    record_id: int
    gir: "GIR"
    source: str
    turn: int
    salience: float
    quids: tuple[str, ...]
    relations: tuple[str, ...]
    quid_weights: tuple[tuple[str, float], ...]
    provenance: tuple[str, ...]
    fingerprint: str


@dataclass(frozen=True, slots=True)
class ContextMatch:
    record_id: int
    score: float
    shared_quids: tuple[str, ...]
    shared_relations: tuple[str, ...]
    recency: float
    source: str
    fingerprint: str


@dataclass(frozen=True, slots=True)
class ContextView:
    query_fingerprint: str
    turn: int
    matches: tuple[ContextMatch, ...]
    active_quids: tuple[str, ...]
    topic_quids: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ContextState:
    turn: int
    records: int
    active_quids: tuple[str, ...]
    topic_quids: tuple[str, ...]


class ContextEngine:
    """Bounded, deterministic discourse context over validated GIR objects.

    Context is transient working memory. It does not write durable graph facts,
    change QUID identity, or decide truth. It ranks prior GIR records using
    shared QUIDs, shared relations, salience and recency.
    """

    SHARED_QUID_WEIGHT = 3.0
    SHARED_RELATION_WEIGHT = 1.25
    RECENCY_WEIGHT = 0.75
    FALLBACK_RECENCY_WEIGHT = 0.25

    def __init__(self, max_records: int = 64) -> None:
        if not isinstance(max_records, int) or isinstance(max_records, bool) or max_records <= 0:
            raise ValueError("max_records must be a positive integer")
        self.max_records = max_records
        self._records: deque[ContextRecord] = deque(maxlen=max_records)
        self._turn = 0

    @property
    def turn(self) -> int:
        return self._turn

    def __len__(self) -> int:
        return len(self._records)

    def clear(self) -> None:
        self._records.clear()
        self._turn = 0

    def ingest(self, gir: "GIR", source: str = "context") -> ContextRecord:
        if gir is None or not hasattr(gir, "validate") or not hasattr(gir, "fingerprint"):
            raise TypeError("ContextEngine requires a validated GIR object")
        gir.validate()
        if not isinstance(source, str) or not source.strip():
            raise ValueError("source must be a non-empty string")

        self._turn += 1
        node_weights: dict[str, float] = {}
        for node in gir.nodes:
            node_weights[node.quid] = max(node_weights.get(node.quid, 0.0), float(node.confidence))

        quids = tuple(node_weights)
        relations = tuple(sorted({edge.relation for edge in gir.edges}))
        quid_weights = tuple(sorted((quid, weight) for quid, weight in node_weights.items()))
        salience = max(node_weights.values(), default=0.0)
        provenance = tuple(sorted(set(gir.provenance)))
        record = ContextRecord(
            record_id=self._turn,
            gir=gir,
            source=source.strip(),
            turn=self._turn,
            salience=salience,
            quids=quids,
            relations=relations,
            quid_weights=quid_weights,
            provenance=provenance,
            fingerprint=gir.fingerprint(),
        )
        self._records.append(record)
        return record

    def records(self) -> tuple[ContextRecord, ...]:
        return tuple(self._records)

    def get(self, record_id: int) -> ContextRecord | None:
        for record in self._records:
            if record.record_id == record_id:
                return record
        return None

    def active_quids(self, limit: int = 8) -> tuple[str, ...]:
        self._validate_limit(limit)
        scores: dict[str, float] = {}
        for record in self._records:
            recency = 1.0 / (1.0 + (self._turn - record.turn))
            for quid, weight in record.quid_weights:
                scores[quid] = scores.get(quid, 0.0) + weight * recency
        ranked = sorted(scores, key=lambda q: (-scores[q], q))
        return tuple(ranked[:limit])

    def topic_quids(self, limit: int = 3) -> tuple[str, ...]:
        self._validate_limit(limit)
        if not self._records:
            return ()
        # Preserve discourse mention order from the most recent GIR rather
        # than letting globally repeated generic concepts dominate the topic.
        return self._records[-1].quids[:limit]

    def view(self, query: "GIR", limit: int = 8) -> ContextView:
        if query is None or not hasattr(query, "validate"):
            raise TypeError("ContextEngine.view requires a GIR object")
        query.validate()
        self._validate_limit(limit)

        query_quids = {node.quid for node in query.nodes}
        query_relations = {edge.relation for edge in query.edges}
        matches: list[ContextMatch] = []

        for record in self._records:
            record_quids = set(record.quids)
            record_relations = set(record.relations)
            shared_quids = tuple(sorted(query_quids & record_quids))
            shared_relations = tuple(sorted(query_relations & record_relations))
            recency = 1.0 / (1.0 + (self._turn - record.turn))

            score = (
                self.SHARED_QUID_WEIGHT * len(shared_quids)
                + self.SHARED_RELATION_WEIGHT * len(shared_relations)
                + self.RECENCY_WEIGHT * recency * record.salience
            )
            if not shared_quids and not shared_relations:
                score = self.FALLBACK_RECENCY_WEIGHT * recency * record.salience

            matches.append(
                ContextMatch(
                    record_id=record.record_id,
                    score=score,
                    shared_quids=shared_quids,
                    shared_relations=shared_relations,
                    recency=recency,
                    source=record.source,
                    fingerprint=record.fingerprint,
                )
            )

        matches.sort(key=lambda item: (-item.score, -item.recency, -item.record_id))
        return ContextView(
            query_fingerprint=query.fingerprint(),
            turn=self._turn,
            matches=tuple(matches[:limit]),
            active_quids=self.active_quids(limit),
            topic_quids=self.topic_quids(min(3, limit)),
        )

    def state(self, active_limit: int = 8, topic_limit: int = 3) -> ContextState:
        self._validate_limit(active_limit)
        self._validate_limit(topic_limit)
        return ContextState(
            turn=self._turn,
            records=len(self._records),
            active_quids=self.active_quids(active_limit),
            topic_quids=self.topic_quids(topic_limit),
        )

    @staticmethod
    def _validate_limit(limit: int) -> None:
        if not isinstance(limit, int) or isinstance(limit, bool) or limit <= 0:
            raise ValueError("limit must be a positive integer")


__all__ = ["ContextEngine", "ContextMatch", "ContextRecord", "ContextState", "ContextView"]

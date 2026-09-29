from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from typing import Iterable

from griot_engine import Fact, GRIOT, QUID
from griot_storage import SQLiteKnowledgeStore


@dataclass(frozen=True, slots=True)
class ShardStats:
    shard_id: int
    facts: int
    quids: int


class ShardedKnowledgeStore:
    """Federated durable store partitioned deterministically by QUID symbol."""

    def __init__(self, directory: str, shards: int = 8) -> None:
        if shards <= 0:
            raise ValueError("shards must be positive")
        self.directory = directory
        self.shards = shards
        os.makedirs(directory, exist_ok=True)
        self._stores = tuple(
            SQLiteKnowledgeStore(os.path.join(directory, f"shard-{index}.sqlite"))
            for index in range(shards)
        )

    def close(self) -> None:
        for store in self._stores:
            store.close()

    def shard_for(self, symbol: str) -> int:
        digest = hashlib.sha256(symbol.encode("utf-8")).digest()
        return int.from_bytes(digest[:8], "big") % self.shards

    def put_fact(self, fact: Fact) -> None:
        self._stores[self.shard_for(fact.subject)].put_fact(fact)

    def put_quid(self, quid: QUID) -> None:
        self._stores[self.shard_for(quid.symbol)].put_quid(quid)

    def put_engine(self, engine: GRIOT) -> None:
        for quid in engine.quids.all():
            self.put_quid(quid)
        for fact in engine.graph.facts():
            self.put_fact(fact)

    def query(
        self,
        *,
        subject: str | None = None,
        relation: str | None = None,
        object_: str | None = None,
        negated: bool | None = None,
    ) -> tuple[Fact, ...]:
        if subject is not None:
            stores = (self._stores[self.shard_for(subject)],)
        else:
            stores = self._stores

        results: list[Fact] = []
        for store in stores:
            results.extend(
                store.query_facts(
                    subject=subject,
                    relation=relation,
                    object_=object_,
                    negated=negated,
                )
            )
        return tuple(sorted(set(results), key=_fact_key))

    def stats(self) -> tuple[ShardStats, ...]:
        return tuple(
            ShardStats(
                index,
                store.stats().facts,
                store.stats().quids,
            )
            for index, store in enumerate(self._stores)
        )

    def __enter__(self) -> "ShardedKnowledgeStore":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()


def _fact_key(fact: Fact) -> tuple[object, ...]:
    return (
        fact.subject,
        fact.relation,
        fact.object,
        fact.negated,
        fact.provenance,
        fact.confidence,
        fact.evidence or "",
        fact.timestamp or "",
    )


__all__ = ["ShardStats", "ShardedKnowledgeStore"]

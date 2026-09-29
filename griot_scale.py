from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter

from griot_engine import Fact, GRIOT
from griot_indices import FactIndices
from griot_sharding import ShardedKnowledgeStore
from griot_selective_retrieval import SelectiveRetriever
from griot_working_graph import WorkingGraph


@dataclass(frozen=True, slots=True)
class ScaleReport:
    facts: int
    indexed: int
    shards: int
    min_shard_facts: int
    max_shard_facts: int
    query_candidates: int
    working_graph_evidence: int
    elapsed_seconds: float


class ScaleHarness:
    """Synthetic scale validation; it measures invariants, not production capacity."""

    def __init__(self, facts: int = 5000, shards: int = 16) -> None:
        if facts <= 0 or shards <= 0:
            raise ValueError("facts and shards must be positive")
        self.facts = facts
        self.shards = shards

    def generate_engine(self) -> GRIOT:
        engine = GRIOT.create()
        relation = "is_a"
        animal = engine.quids.get("animal").symbol
        for index in range(self.facts):
            subject = engine.quids.ensure(
                f"scale-entity-{index}",
                family_id=1,
            ).symbol
            engine.graph.add_fact(
                Fact(
                    subject,
                    relation,
                    animal,
                    0.8,
                    False,
                    "scale-fixture",
                )
            )
        return engine

    def run(self) -> ScaleReport:
        start = perf_counter()
        engine = self.generate_engine()

        indices = FactIndices(engine.graph.facts())
        retriever = SelectiveRetriever(engine, budget=64)
        first_subject = next(iter(engine.graph.facts())).subject
        retrieval = retriever.retrieve(subject=first_subject)

        working = WorkingGraph(max_evidence=128)
        working.extend(
            engine.graph.facts(),
            origin="scale-fixture",
            score=0.5,
        )

        with __import__("tempfile").TemporaryDirectory() as directory:
            shards = ShardedKnowledgeStore(directory, self.shards)
            try:
                shards.put_engine(engine)
                stats = shards.stats()
            finally:
                shards.close()

        elapsed = perf_counter() - start
        shard_counts = [item.facts for item in stats]
        return ScaleReport(
            self.facts,
            indices.stats().facts,
            self.shards,
            min(shard_counts),
            max(shard_counts),
            len(retrieval.items),
            len(working),
            elapsed,
        )


__all__ = ["ScaleHarness", "ScaleReport"]

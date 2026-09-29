import os
import tempfile
import unittest

from griot_cache import GenerationCache
from griot_engine import Fact, GRIOT
from griot_indices import FactIndices
from griot_selective_retrieval import SelectiveRetriever
from griot_sharding import ShardedKnowledgeStore
from griot_working_graph import WorkingGraph


class ScaleIntegrationTests(unittest.TestCase):
    def test_combined_10000_fact_invariants(self) -> None:
        engine = GRIOT.create()
        animal = engine.quids.get("animal").symbol

        for index in range(10000):
            subject = engine.quids.ensure(f"entity-{index}", family_id=1).symbol
            engine.graph.add_fact(
                Fact(subject, "is_a", animal, 0.75, False, f"source-{index % 20}")
            )

        facts = tuple(engine.graph.facts())
        indices = FactIndices(facts)
        self.assertEqual(indices.stats().facts, 10000)

        cache = GenerationCache[tuple[Fact, ...]](capacity=32)
        cache.put(("all",), facts[:32])
        self.assertEqual(cache.get(("all",)), facts[:32])

        retriever = SelectiveRetriever(engine, budget=32)
        result = retriever.retrieve(object_=animal, relation="is_a")
        self.assertLessEqual(len(result.items), 32)
        self.assertTrue(result.truncated)

        working = WorkingGraph(max_evidence=128)
        working.extend(facts, origin="scale", score=0.5)
        self.assertEqual(len(working), 128)

    def test_sharded_10000_fact_round_trip(self) -> None:
        engine = GRIOT.create()
        animal = engine.quids.get("animal").symbol
        for index in range(10000):
            subject = engine.quids.ensure(f"entity-{index}", family_id=1).symbol
            engine.graph.add_fact(
                Fact(subject, "is_a", animal, 0.75, False, "scale")
            )

        with tempfile.TemporaryDirectory() as directory:
            store = ShardedKnowledgeStore(directory, shards=16)
            try:
                store.put_engine(engine)
                stats = store.stats()
                self.assertEqual(sum(item.facts for item in stats), 10000)
                self.assertTrue(any(item.facts > 0 for item in stats))
            finally:
                store.close()

    def test_retrieval_budget_is_monotonic(self) -> None:
        engine = GRIOT.create()
        animal = engine.quids.get("animal").symbol
        for index in range(100):
            subject = engine.quids.ensure(f"small-{index}", family_id=1).symbol
            engine.graph.add_fact(
                Fact(subject, "is_a", animal, 0.8, False, "scale")
            )

        small = SelectiveRetriever(engine, budget=8).retrieve(object_=animal)
        large = SelectiveRetriever(engine, budget=32).retrieve(object_=animal)
        self.assertLessEqual(len(small.items), len(large.items))
        self.assertTrue(small.truncated)
        self.assertTrue(large.truncated)

    def test_indices_and_storage_preserve_provenance_diversity(self) -> None:
        engine = GRIOT.create()
        lion = engine.quids.get("leão").symbol
        animal = engine.quids.get("animal").symbol
        facts = tuple(
            Fact(lion, "is_a", animal, 0.9, False, f"source-{index}")
            for index in range(10)
        )
        indices = FactIndices(facts)
        self.assertEqual(len(indices.exact(lion, "is_a", animal)), 10)

        with tempfile.TemporaryDirectory() as directory:
            store = ShardedKnowledgeStore(directory, shards=4)
            try:
                for fact in facts:
                    store.put_fact(fact)
                restored = store.query(
                    subject=lion,
                    relation="is_a",
                    object_=animal,
                )
                self.assertEqual(len(restored), 10)
                self.assertEqual(
                    {fact.provenance for fact in restored},
                    {f"source-{index}" for index in range(10)},
                )
            finally:
                store.close()


if __name__ == "__main__":
    unittest.main()

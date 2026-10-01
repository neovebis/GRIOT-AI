import os
import tempfile
import unittest

from griot_engine import Fact, GRIOT
from griot_sharding import ShardedKnowledgeStore
from quid_core import Quid


class ShardingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.engine.learn("O leão é um animal. O lobo é um animal.", source="memory")

    def test_shard_assignment_is_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            a = ShardedKnowledgeStore(directory, shards=7)
            b = ShardedKnowledgeStore(directory, shards=7)
            self.assertEqual(a.shard_for("🦁"), b.shard_for("🦁"))
            a.close()
            b.close()

    def test_engine_persistence_is_partitioned(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with ShardedKnowledgeStore(directory, shards=4) as store:
                store.put_engine(self.engine)
                stats = store.stats()
                self.assertEqual(sum(item.facts for item in stats), 2)
                self.assertGreaterEqual(sum(item.quids for item in stats), 2)

    def test_subject_query_hits_correct_shard(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with ShardedKnowledgeStore(directory, shards=4) as store:
                store.put_engine(self.engine)
                lion = self.engine.quids.get("leão").symbol
                facts = store.query(subject=lion, relation="is_a")
                self.assertEqual(len(facts), 1)
                self.assertEqual(facts[0].provenance, "memory")

    def test_object_query_federates_across_shards(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with ShardedKnowledgeStore(directory, shards=4) as store:
                store.put_engine(self.engine)
                animal = self.engine.quids.get("animal").symbol
                facts = store.query(object_=animal, relation="is_a")
                self.assertEqual(len(facts), 2)

    def test_distinct_sources_remain_distinct(self) -> None:
        lion = self.engine.quids.get("leão").symbol
        animal = self.engine.quids.get("animal").symbol
        self.engine.graph.add_fact(Fact(lion, "is_a", animal, 0.8, False, "second"))

        with tempfile.TemporaryDirectory() as directory:
            with ShardedKnowledgeStore(directory, shards=3) as store:
                store.put_engine(self.engine)
                facts = store.query(subject=lion, relation="is_a")
                self.assertEqual({fact.provenance for fact in facts}, {"memory", "second"})

    def test_quid_persist_sharded_creates_multiple_store_files(self) -> None:
        quid = Quid(self.engine)
        with tempfile.TemporaryDirectory() as directory:
            quid.persist_sharded(directory, shards=4)
            files = [name for name in os.listdir(directory) if name.endswith(".sqlite")]
            self.assertEqual(len(files), 4)


if __name__ == "__main__":
    unittest.main()

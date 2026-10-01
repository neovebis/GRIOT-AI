import os
import tempfile
import unittest

from griot_engine import GRIOT
from griot_storage import SQLiteKnowledgeStore
from quid_core import Quid


class StorageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.engine.learn("O leão é um animal.", source="book-a")
        self.engine.learn("O leão é um animal.", source="book-b")

    def test_memory_store_round_trip(self) -> None:
        with SQLiteKnowledgeStore() as store:
            store.put_engine(self.engine)
            self.assertEqual(store.stats().facts, 2)
            facts = store.query_facts(subject="🦁", relation="is_a")
            self.assertEqual(len(facts), 2)
            self.assertEqual({fact.provenance for fact in facts}, {"book-a", "book-b"})

    def test_file_store_survives_reopen(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "griot.sqlite")
            with SQLiteKnowledgeStore(path) as store:
                store.put_engine(self.engine)

            with SQLiteKnowledgeStore(path) as reopened:
                self.assertEqual(reopened.stats().facts, 2)
                self.assertEqual(
                    reopened.get_quid("🦁").label,
                    self.engine.quids.get("🦁").label,
                )

    def test_quid_persist_and_restore(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "griot.sqlite")
            original = Quid(self.engine)
            original.persist_storage(path)
            restored = Quid.from_storage(path)
            result = restored.analisar("leão é um animal")
            self.assertTrue(result.answer)
            self.assertEqual(result.provenance, ("book-a", "book-b"))

    def test_indexed_filtered_queries_work(self) -> None:
        with SQLiteKnowledgeStore() as store:
            store.put_engine(self.engine)
            self.assertEqual(len(store.query_facts(subject="🦁")), 2)
            self.assertEqual(len(store.query_facts(object_="🐾")), 0)
            self.assertEqual(len(store.query_facts(provenance="book-a")), 1)

    def test_duplicate_put_is_idempotent(self) -> None:
        with SQLiteKnowledgeStore() as store:
            store.put_engine(self.engine)
            store.put_engine(self.engine)
            self.assertEqual(store.stats().facts, 2)

    def test_schema_version_is_explicit(self) -> None:
        with SQLiteKnowledgeStore() as store:
            value = store.connection.execute(
                "SELECT value FROM meta WHERE key='schema_version'"
            ).fetchone()[0]
            self.assertEqual(value, "1")


if __name__ == "__main__":
    unittest.main()

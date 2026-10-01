import os
import tempfile
import unittest

from griot_engine import GRIOT
from griot_incremental import IncrementalLearner
from griot_storage import SQLiteKnowledgeStore
from griot_versioning import KnowledgeVersionStore
from griot_working_graph import WorkingGraph
from quid_core import Quid


class MemoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.quid = Quid(self.engine)

    def test_independent_sources_survive_reasoning(self) -> None:
        self.engine.learn("O leão é um animal.", source="book-a")
        self.engine.learn("O leão é um animal.", source="book-b")
        result = self.quid.analisar("leão é um animal")
        self.assertTrue(result.answer)
        self.assertEqual(
            {fact.provenance for fact in result.reasoning.claims[0].evidence},
            {"book-a", "book-b"},
        )

    def test_incremental_learning_creates_version_chain(self) -> None:
        learner = IncrementalLearner(self.engine)
        first = learner.learn("O leão é um animal.", source="a")
        second = learner.learn("O lobo é um animal.", source="b")
        self.assertEqual(first.version.sequence, 2)
        self.assertEqual(second.version.parent_version, first.version.version_id)
        self.assertEqual(len(second.diff.added), 1)

    def test_sqlite_restore_preserves_sources(self) -> None:
        self.engine.learn("O leão é um animal.", source="a")
        self.engine.learn("O leão é um animal.", source="b")
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "memory.sqlite")
            with SQLiteKnowledgeStore(path) as store:
                store.put_engine(self.engine)
            restored = Quid.from_storage(path)
            self.assertTrue(restored.analisar("leão é um animal").answer)
            self.assertEqual(
                restored.analisar("leão é um animal").provenance,
                ("a", "b"),
            )

    def test_working_graph_is_transient(self) -> None:
        self.engine.learn("O leão é um animal.", source="a")
        before = set(self.engine.graph.facts())
        working = WorkingGraph(max_evidence=10)
        fact = next(iter(before))
        working.add(fact, origin="test")
        self.assertEqual(set(self.engine.graph.facts()), before)
        self.assertEqual(working.state().evidence_count, 1)

    def test_version_store_diff_is_reversible(self) -> None:
        store = KnowledgeVersionStore()
        empty = store.commit(())
        fact = next(
            iter(
                Quid(self.engine).extract_knowledge("O leão é um animal.").candidates
            )
        ).fact
        full = store.commit((fact,))
        diff = store.diff(empty.version_id, full.version_id)
        self.assertEqual(diff.removed, ())
        self.assertEqual(diff.added, (fact,))

    def test_memory_query_has_bounded_evidence(self) -> None:
        for index in range(500):
            self.engine.learn("O leão é um animal.", source=f"source-{index}")
        result = self.quid.analisar("leão é um animal")
        self.assertLessEqual(result.working_graph.evidence_count, 256)


if __name__ == "__main__":
    unittest.main()

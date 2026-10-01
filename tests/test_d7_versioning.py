import unittest

from griot_engine import Fact, GRIOT
from griot_versioning import KnowledgeVersionStore
from quid_core import Quid


class VersioningTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.quid = Quid(self.engine)

    def test_empty_knowledge_version_is_deterministic_within_sequence(self) -> None:
        store = KnowledgeVersionStore()
        first = store.commit(())
        second = store.commit(())
        self.assertNotEqual(first.version_id, second.version_id)
        self.assertEqual(first.sequence, 1)
        self.assertEqual(second.sequence, 2)

    def test_parent_chain_is_explicit(self) -> None:
        store = KnowledgeVersionStore()
        first = store.commit(())
        second = store.commit((
            Fact("🦁", "is_a", "🐺", 0.9, False, "a"),
        ))
        self.assertIsNone(first.parent_version)
        self.assertEqual(second.parent_version, first.version_id)

    def test_diff_tracks_added_and_removed_facts(self) -> None:
        store = KnowledgeVersionStore()
        first = store.commit((Fact("🦁", "is_a", "🐺", 0.9, False, "a"),))
        second = store.commit((
            Fact("🦁", "is_a", "🐺", 0.9, False, "a"),
            Fact("🐺", "is_a", "🐾", 0.8, False, "b"),
        ))
        diff = store.diff(first.version_id, second.version_id)
        self.assertEqual(len(diff.added), 1)
        self.assertEqual(diff.added[0].provenance, "b")
        self.assertEqual(diff.removed, ())

    def test_version_serialization_is_canonical(self) -> None:
        store = KnowledgeVersionStore()
        version = store.commit((Fact("🦁", "is_a", "🐺", 0.9, False, "a"),))
        self.assertEqual(version.canonical_json(), version.canonical_json())

    def test_quid_exposes_version_history(self) -> None:
        first = self.quid.version_knowledge()
        self.engine.learn("O leão é um animal.", source="memory")
        second = self.quid.version_knowledge()
        self.assertEqual(first.sequence, 1)
        self.assertEqual(second.sequence, 2)
        self.assertEqual(second.parent_version, first.version_id)
        self.assertEqual(len(self.quid.knowledge_history()), 2)


if __name__ == "__main__":
    unittest.main()

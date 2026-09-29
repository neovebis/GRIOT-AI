import unittest

from griot_engine import GRIOT
from griot_incremental import IncrementalLearner
from griot_promotion import KnowledgeLevel
from quid_core import Quid


class IncrementalLearningTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.learner = IncrementalLearner(self.engine)
        self.quid = Quid(self.engine)

    def test_first_increment_commits_and_versions(self) -> None:
        update = self.learner.learn("O leão é um animal.", source="book-a")
        self.assertTrue(update.changed)
        self.assertEqual(update.consolidation.committed_count, 1)
        self.assertEqual(len(update.diff.added), 1)
        self.assertEqual(update.diff.removed, ())
        self.assertEqual(update.version.sequence, 2)

    def test_repeat_increment_is_idempotent(self) -> None:
        first = self.learner.learn("O leão é um animal.", source="book-a")
        second = self.learner.learn("O leão é um animal.", source="book-a")
        self.assertTrue(first.changed)
        self.assertFalse(second.changed)
        self.assertEqual(second.diff.added, ())
        self.assertEqual(second.diff.removed, ())
        self.assertEqual(len(self.engine.graph.facts()), 1)

    def test_different_source_is_processed_as_new_evidence(self) -> None:
        self.learner.learn("O leão é um animal.", source="book-a")
        second = self.learner.learn("O leão é um animal.", source="book-b")
        self.assertTrue(second.changed)
        self.assertEqual(len(self.engine.graph.facts()), 2)

    def test_conflict_is_not_committed(self) -> None:
        self.learner.learn("O leão é um animal.", source="book-a")
        update = self.learner.learn("O leão não é um animal.", source="book-b")
        self.assertFalse(update.changed)
        self.assertEqual(len(self.engine.graph.facts()), 1)
        self.assertTrue(update.validation.rejected)

    def test_promotion_state_updates_incrementally(self) -> None:
        self.learner.learn("O leão é um animal.", source="a")
        second = self.learner.learn("O leão é um animal.", source="b")
        target = next(
            item
            for item in second.promotion
            if item.key[0] == self.engine.quids.get("leão").symbol
        )
        self.assertEqual(target.level, KnowledgeLevel.PROMOTED)

    def test_quid_exposes_incremental_learning(self) -> None:
        update = self.quid.incremental_learn(
            "O lobo é um animal.",
            source="book-a",
        )
        self.assertTrue(update.changed)
        self.assertEqual(len(self.engine.graph.facts()), 1)


if __name__ == "__main__":
    unittest.main()

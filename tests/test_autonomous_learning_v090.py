import unittest

from griot_autonomous_learning_v090 import AutonomousLearner, ConsolidationDecision
from griot.engine import GRIOT


class AutonomousLearningV090Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT()
        self.learner = AutonomousLearner(self.engine)

    def test_observe_does_not_mutate_durable_memory(self):
        before = len(self.engine.graph.facts())
        candidates = self.learner.observe("O leão é um mamífero.", source="doc-a")
        self.assertTrue(candidates)
        self.assertEqual(before, len(self.engine.graph.facts()))
        self.assertTrue(self.learner.staging())

    def test_single_clean_source_is_consolidated(self):
        self.learner.observe("O leão é um mamífero.", source="doc-a")
        report = self.learner.consolidate()
        self.assertEqual(report.observed, 1)
        self.assertEqual(report.accepted, 1)
        self.assertEqual(report.records[0].decision, ConsolidationDecision.ACCEPT)
        self.assertTrue(self.engine.ask("leão é um mamífero").answer)

    def test_corroboration_merges_sources(self):
        self.learner.observe("O leão é um mamífero.", source="doc-a")
        self.learner.observe("O leão é um mamífero.", source="doc-b")
        report = self.learner.consolidate()
        self.assertEqual(report.accepted, 1)
        record = report.records[0]
        self.assertEqual(record.source_diversity, 2)
        fact = next(iter(self.engine.graph.facts()))
        self.assertEqual(fact.provenance, "autonomous:doc-a,doc-b")

    def test_conflict_is_held(self):
        self.learner.observe("O leão é um mamífero.", source="positive")
        self.learner.observe("O leão não é um mamífero.", source="negative")
        report = self.learner.consolidate()
        self.assertEqual(report.held, 2)
        self.assertEqual(len(self.engine.graph.facts()), 0)

    def test_low_confidence_can_be_rejected(self):
        self.learner.observe("O leão é um mamífero.", source="weak")
        report = self.learner.consolidate(min_confidence=1.0, corroboration_threshold=2)
        self.assertEqual(report.rejected, 1)
        self.assertEqual(len(self.engine.graph.facts()), 0)

    def test_concepts_remain_atomic(self):
        self.learner.observe("O leão é um mamífero. O mamífero é um ser vivo.", source="doc")
        self.learner.consolidate()
        self.assertTrue(all(len(q.symbol) == 1 for q in self.engine.quids.all()))


if __name__ == "__main__":
    unittest.main()

import unittest

from griot_hypothesis_v050 import HypothesisController, HypothesisKind
from griot_reasoning_v040 import TruthStatus


class HypothesisV050Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.controller = HypothesisController()

    def test_unknown_query_can_generate_analogical_hypothesis(self):
        s = self.controller.reasoning.semantic
        s.learn("O leão é um animal. O lobo é um animal. O lobo é um predador.", source="test")
        report = self.controller.generate("leão é um predador")
        self.assertEqual(report.source_status, TruthStatus.UNKNOWN)
        self.assertTrue(report.hypotheses)
        self.assertEqual(report.hypotheses[0].kind, HypothesisKind.ANALOGY)
        self.assertFalse(report.hypotheses[0].heuristic is False)

    def test_existing_truth_does_not_become_hypothesis(self):
        self.controller.reasoning.semantic.learn("O leão é um animal.", source="test")
        report = self.controller.generate("leão é um animal")
        self.assertEqual(report.source_status, TruthStatus.SUPPORTED)
        self.assertFalse(report.hypotheses)

    def test_counterfactual_replaces_opposite_fact(self):
        s = self.controller.reasoning.semantic
        s.learn("O leão é um animal.", source="test")
        result = self.controller.counterfactual("O leão não é um animal.", "leão é um animal")
        self.assertEqual(result.before.status, TruthStatus.SUPPORTED)
        self.assertEqual(result.after.status, TruthStatus.REFUTED)
        self.assertTrue(result.changed)

    def test_hypothesis_is_never_committed(self):
        s = self.controller.reasoning.semantic
        s.learn("O leão é um animal. O lobo é um animal. O lobo é um predador.", source="test")
        before = len(s.engine.graph.facts())
        self.controller.generate("leão é um predador")
        after = len(s.engine.graph.facts())
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()

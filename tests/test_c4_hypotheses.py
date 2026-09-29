import unittest

from griot_hypothesis_v050 import HypothesisController, HypothesisKind
from griot_reasoning_v040 import ReasoningEngine, TruthStatus
from griot_engine import GRIOT
from quid_core import Quid


class HypothesisTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.controller = HypothesisController(ReasoningEngine(
            __import__("griot_semantic_ir", fromlist=["SemanticGRIOT"]).SemanticGRIOT(self.engine)
        ))
        self.quid = Quid(self.engine)

    def test_unknown_query_can_generate_analogical_hypothesis(self) -> None:
        self.controller.reasoning.semantic.learn(
            "O leão é um animal. O lobo é um animal. O lobo é um predador.",
            source="facts",
        )
        report = self.controller.generate("leão é um predador")
        self.assertEqual(report.source_status, TruthStatus.UNKNOWN)
        self.assertTrue(report.hypotheses)
        self.assertEqual(report.hypotheses[0].kind, HypothesisKind.ANALOGY)
        self.assertTrue(report.hypotheses[0].heuristic)

    def test_existing_truth_does_not_become_hypothesis(self) -> None:
        self.controller.reasoning.semantic.learn(
            "O leão é um animal.",
            source="facts",
        )
        report = self.controller.generate("leão é um animal")
        self.assertEqual(report.source_status, TruthStatus.SUPPORTED)
        self.assertFalse(report.hypotheses)

    def test_hypotheses_are_never_committed(self) -> None:
        self.controller.reasoning.semantic.learn(
            "O leão é um animal. O lobo é um animal. O lobo é um predador.",
            source="facts",
        )
        before = len(self.engine.graph.facts())
        self.controller.generate("leão é um predador")
        self.assertEqual(before, len(self.engine.graph.facts()))

    def test_counterfactual_sandbox_does_not_mutate_source_memory(self) -> None:
        self.controller.reasoning.semantic.learn(
            "O leão é um animal.",
            source="facts",
        )
        before = set(self.engine.graph.facts())
        result = self.controller.counterfactual(
            "O leão não é um animal.",
            "leão é um animal",
        )
        self.assertEqual(result.before.status, TruthStatus.SUPPORTED)
        self.assertEqual(result.after.status, TruthStatus.REFUTED)
        self.assertTrue(result.changed)
        self.assertEqual(set(self.engine.graph.facts()), before)

    def test_quid_exposes_provisional_hypotheses(self) -> None:
        self.engine.learn(
            "O leão é um animal. O lobo é um animal. O lobo é um predador.",
            source="facts",
        )
        report = self.quid.generate_hypotheses("leão é um predador")
        self.assertEqual(report.source_status, TruthStatus.UNKNOWN)
        self.assertTrue(report.hypotheses)
        self.assertTrue(all(h.heuristic for h in report.hypotheses))


if __name__ == "__main__":
    unittest.main()

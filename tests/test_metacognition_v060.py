import unittest

from griot_hypothesis_v050 import HypothesisController, HypothesisKind
from griot_metacognition_v060 import ExperimentPlanner, MetacognitiveController, QualityClass
from griot_reasoning_v040 import TruthStatus


class MetacognitionV060Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.reasoning = MetacognitiveController()
        self.hypotheses = HypothesisController(self.reasoning.reasoning)

    def test_direct_answer_is_classified_direct(self):
        self.reasoning.reasoning.semantic.learn("O leão é um animal.", source="direct-source")
        a = self.reasoning.assess("leão é um animal")
        self.assertEqual(a.status, TruthStatus.SUPPORTED)
        self.assertEqual(a.quality_class, QualityClass.DIRECT)
        self.assertEqual(a.direct_evidence_count, 1)

    def test_inferred_answer_requests_verification(self):
        s = self.reasoning.reasoning.semantic
        s.learn("O leão é um animal. O animal é um ser vivo.", source="taxonomy")
        a = self.reasoning.assess("leão é um ser vivo")
        self.assertEqual(a.status, TruthStatus.SUPPORTED)
        self.assertEqual(a.quality_class, QualityClass.INFERRED)
        self.assertIn("verify", a.recommended_action)

    def test_unknown_answer_requests_evidence(self):
        a = self.reasoning.assess("leão é um planeta")
        self.assertEqual(a.quality_class, QualityClass.UNKNOWN)
        self.assertEqual(a.quality_score, 0.0)

    def test_plan_turns_analogy_into_testable_prediction(self):
        s = self.reasoning.reasoning.semantic
        s.learn(
            "O leão é um animal. O lobo é um animal. O lobo é um predador. O predador causa fuga.",
            source="knowledge",
        )
        report = self.hypotheses.generate("leão é um predador")
        h = next((h for h in report.hypotheses if h.kind == HypothesisKind.ANALOGY), None)
        self.assertIsNotNone(h)
        assert h is not None
        plan = ExperimentPlanner(self.hypotheses.reasoning).plan(h)
        self.assertTrue(any(p.relation == "causes" for p in plan.predictions))
        before = len(s.engine.graph.facts())
        ExperimentPlanner(self.hypotheses.reasoning).plan(h)
        self.assertEqual(before, len(s.engine.graph.facts()))

    def test_conflict_gets_explicit_caveat(self):
        s = self.reasoning.reasoning.semantic
        s.learn("O leão é um mamífero.", source="a")
        s.learn("O leão não é um mamífero.", source="b")
        a = self.reasoning.assess("leão é um mamífero")
        self.assertEqual(a.quality_class, QualityClass.CONFLICTED)
        self.assertTrue(a.caveats)


if __name__ == "__main__":
    unittest.main()

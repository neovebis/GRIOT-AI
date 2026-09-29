import unittest

from griot_engine import GRIOT
from griot_reasoning_v040 import TruthStatus
from quid_core import Quid


class A1UnifiedPipelineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.quid = Quid(self.engine)

    def test_analysis_shares_one_semantic_ir_with_reasoning(self) -> None:
        calls = 0
        original = self.quid.semantic.understand

        def counted(text: str):
            nonlocal calls
            calls += 1
            return original(text)

        self.quid.semantic.understand = counted  # type: ignore[method-assign]
        self.engine.learn("O leão é um animal.", source="test")

        result = self.quid.analisar("leão é um animal")

        self.assertEqual(calls, 1)
        self.assertIs(result.gir, result.reasoning.meaning)
        self.assertEqual(result.epistemic_status, TruthStatus.SUPPORTED)
        self.assertTrue(result.answer)
        self.assertTrue(result.graph_evidence)
        self.assertTrue(result.provenance)

    def test_transitive_inference_stays_in_the_same_pipeline(self) -> None:
        self.engine.learn(
            "O leão é um animal. O animal é um ser vivo.",
            source="test",
        )

        result = self.quid.analisar("leão é um ser vivo")

        self.assertEqual(result.epistemic_status, TruthStatus.SUPPORTED)
        self.assertTrue(result.answer)
        self.assertTrue(result.reasoning.proofs)
        self.assertTrue(any(step.rule.startswith("transitive:") for step in result.reasoning.proofs))
        self.assertIn("inference", result.provenance)

    def test_conflict_is_an_explicit_non_answer(self) -> None:
        self.engine.learn("O leão é um mamífero.", source="positive")
        self.engine.learn("O leão não é um mamífero.", source="negative")

        result = self.quid.analisar("leão é um mamífero")

        self.assertEqual(result.epistemic_status, TruthStatus.CONFLICT)
        self.assertIsNone(result.answer)
        self.assertTrue(result.abstained)
        self.assertEqual(result.reasoning.status, TruthStatus.CONFLICT)

    def test_refuted_is_distinct_from_unknown(self) -> None:
        self.engine.learn("O leão não é um planeta.", source="negative")

        refuted = self.quid.analisar("leão é um planeta")
        unknown = self.quid.analisar("leão é uma galáxia")

        self.assertEqual(refuted.epistemic_status, TruthStatus.REFUTED)
        self.assertFalse(refuted.answer)
        self.assertEqual(unknown.epistemic_status, TruthStatus.UNKNOWN)
        self.assertIsNone(unknown.answer)
        self.assertNotEqual(refuted.epistemic_status, unknown.epistemic_status)

    def test_gritot_ask_is_only_a_compatibility_adapter(self) -> None:
        self.engine.learn("O leão é um animal.", source="test")

        analysis = self.quid.analisar("leão é um animal")
        answer = self.engine.ask("leão é um animal")

        self.assertEqual(answer.answer, analysis.answer)
        self.assertEqual(answer.confidence, analysis.confidence)
        self.assertEqual(tuple(answer.evidence), analysis.graph_evidence)
        self.assertEqual(answer.explanation, analysis.explanation)


if __name__ == "__main__":
    unittest.main()

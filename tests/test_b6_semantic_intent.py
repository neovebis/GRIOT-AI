import unittest

from griot_engine import GRIOT
from griot_intent import IntentType, SemanticIntentDetector
from griot_semantic_ir import SemanticGRIOT
from quid_core import Quid


class SemanticIntentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.semantic = SemanticGRIOT(self.engine)
        self.detector = SemanticIntentDetector()

    def test_definition_question_is_classified(self) -> None:
        intent = self.detector.detect("O que é um leão?")
        self.assertEqual(intent.primary, IntentType.DEFINITION)
        self.assertTrue(intent.is_query)
        self.assertEqual(intent.speech_act, "interrogative")

    def test_calculation_intent_is_explicit(self) -> None:
        intent = self.detector.detect("Calcula 2 + 2.")
        self.assertEqual(intent.primary, IntentType.CALCULATION)
        self.assertIn(IntentType.CALCULATION, [signal.intent for signal in intent.signals])

    def test_explanation_and_simulation_are_distinct(self) -> None:
        explanation = self.detector.detect("Explica porque o leão fugiu.")
        simulation = self.detector.detect("Simula o que acontece se o leão fugir.")
        self.assertEqual(explanation.primary, IntentType.EXPLANATION)
        self.assertEqual(simulation.primary, IntentType.SIMULATION)
        self.assertNotEqual(explanation.primary, simulation.primary)

    def test_learning_and_creation_are_distinct(self) -> None:
        learning = self.detector.detect("Aprende esta regra.")
        creation = self.detector.detect("Cria uma prova.")
        self.assertEqual(learning.primary, IntentType.LEARNING)
        self.assertEqual(creation.primary, IntentType.CREATION)

    def test_legacy_frame_is_only_a_secondary_signal(self) -> None:
        gir = self.semantic.understand("O que é um leão?")
        self.assertEqual(gir.constraints["intent"]["primary"], IntentType.DEFINITION.value)
        self.assertTrue(gir.constraints["intent"]["signals"])

    def test_intent_survives_gir_round_trip(self) -> None:
        gir = self.semantic.understand("Compara leão e lobo.")
        restored = type(gir).from_json(gir.canonical_json())
        self.assertEqual(restored.constraints["intent"], gir.constraints["intent"])

    def test_quid_result_exposes_intent_without_changing_epistemic_answer(self) -> None:
        self.engine.learn("O leão é um animal.", source="memory")
        result = Quid(self.engine).analisar("O que é um leão?")
        self.assertEqual(result.intent.primary, IntentType.DEFINITION)
        self.assertIn("leão", result.intent.target)
        self.assertIn(result.epistemic_status.value, {"supported", "refuted", "conflict", "unknown"})


if __name__ == "__main__":
    unittest.main()

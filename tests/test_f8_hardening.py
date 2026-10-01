import unittest

from griot.engine import GRIOT
from griot.types import Fact, Inference, SemanticFrame
from griot_metacognition_v060 import MetacognitiveController


class CompatibilityTests(unittest.TestCase):
    def test_legacy_engine_alias_is_current_engine(self) -> None:
        engine = GRIOT.create()
        self.assertEqual(type(engine).__name__, "GRIOT")
        engine.learn("O leão é um animal.", source="legacy")
        self.assertTrue(engine.ask("leão é um animal").answer)

    def test_legacy_types_resolve(self) -> None:
        self.assertTrue(Fact)
        self.assertTrue(Inference)
        self.assertTrue(SemanticFrame)

    def test_metacognition_constructs_with_current_engine(self) -> None:
        engine = GRIOT.create()
        controller = MetacognitiveController()
        controller.reasoning.semantic.engine = engine
        self.assertIsNotNone(controller.assess("leão é um animal"))

if __name__ == "__main__":
    unittest.main()

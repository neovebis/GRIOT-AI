import unittest

from griot_reasoning_v040 import ReasoningController, TruthStatus


class ReasoningControllerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.controller = ReasoningController()

    def test_supported_with_proof(self):
        self.controller.semantic.learn("O leão é um animal. O animal é um ser vivo.", source="test")
        result = self.controller.reason("leão é um ser vivo")
        self.assertEqual(result.status, TruthStatus.SUPPORTED)
        self.assertTrue(result.proofs)

    def test_conflict_is_explicit(self):
        self.controller.semantic.learn("O leão é um mamífero.", source="positive")
        self.controller.semantic.learn("O leão não é um mamífero.", source="negative")
        result = self.controller.reason("leão é um mamífero")
        self.assertEqual(result.status, TruthStatus.CONFLICT)

    def test_unknown_is_not_refuted(self):
        result = self.controller.reason("leão é um planeta")
        self.assertEqual(result.status, TruthStatus.UNKNOWN)
        self.assertEqual(result.confidence, 0.0)

    def test_why_returns_causes(self):
        self.controller.semantic.learn("A tempestade causa inundação.", source="test")
        causes = self.controller.why("inundação")
        self.assertTrue(causes)
        self.assertEqual(causes[0].relation, "causes")


if __name__ == "__main__":
    unittest.main()

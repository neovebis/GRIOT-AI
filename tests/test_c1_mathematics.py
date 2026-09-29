import unittest
from fractions import Fraction

from griot_engine import GRIOT
from griot_math import MathEngine, MathStatus
from griot_intent import IntentType
from quid_core import Quid


class MathematicsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.math = MathEngine(self.engine)

    def test_integer_arithmetic_is_exact(self) -> None:
        result = self.math.calculate("Calcula 2 + 2.")
        self.assertEqual(result.status, MathStatus.EXACT)
        self.assertTrue(result.exact)
        self.assertEqual(result.value, 4)
        self.assertEqual(result.confidence, 1.0)

    def test_fraction_arithmetic_is_exact(self) -> None:
        result = self.math.calculate("Calcula 1/3 + 1/6.")
        self.assertEqual(result.status, MathStatus.EXACT)
        self.assertEqual(result.value, Fraction(1, 2))

    def test_math_functions_can_be_approximate(self) -> None:
        result = self.math.calculate("Calcula sqrt(2).")
        self.assertEqual(result.status, MathStatus.APPROXIMATE)
        self.assertFalse(result.exact)
        self.assertAlmostEqual(float(result.value), 2 ** 0.5, places=12)

    def test_invalid_expression_is_explicit(self) -> None:
        result = self.math.calculate("Calcula 2 + banana.")
        self.assertEqual(result.status, MathStatus.INVALID)
        self.assertIsNone(result.value)
        self.assertIsNotNone(result.error)

    def test_quid_analysis_exposes_math_result(self) -> None:
        result = Quid(self.engine).analisar("Calcula 7 * 6.")
        self.assertEqual(result.intent.primary, IntentType.CALCULATION)
        self.assertEqual(result.math_result.value, 42)
        self.assertEqual(result.answer_value, 42)

    def test_math_does_not_change_boolean_epistemic_contract(self) -> None:
        result = Quid(self.engine).analisar("Calcula 7 * 6.")
        self.assertIsNone(result.answer)
        self.assertEqual(result.epistemic_status.value, "unknown")


if __name__ == "__main__":
    unittest.main()

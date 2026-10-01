from __future__ import annotations

import unittest

from griot_integration_pipeline import IntegratedReasoningResult
from griot_reasoning_v040 import TruthStatus
from griot_runtime import GRIOTRuntime
from quid_core import Quid


class TestH6IntegratedRuntimeAPI(unittest.TestCase):
    def setUp(self) -> None:
        self.quid = Quid()
        self.runtime = GRIOTRuntime(self.quid)

    def test_runtime_exposes_canonical_integrated_result(self) -> None:
        self.quid.engine.learn("O lobo é um animal.", "memory")

        result = self.runtime.analyze_integrated("O lobo é um animal?")

        self.assertIsInstance(result, IntegratedReasoningResult)
        self.assertEqual(result.epistemic_status, TruthStatus.SUPPORTED)
        self.assertEqual(result.gir, result.base_reasoning.meaning)
        self.assertIs(result.gir, result.advanced_reasoning.result.meaning)
        self.assertTrue(result.verification_ok)

    def test_integrated_api_uses_one_compilation(self) -> None:
        calls = 0
        original = self.quid.semantic.understand

        def counted(text: str):
            nonlocal calls
            calls += 1
            return original(text)

        self.quid.semantic.understand = counted  # type: ignore[method-assign]

        result = self.runtime.analyze_integrated("O lobo é um animal?")

        self.assertEqual(calls, 1)
        self.assertIs(result.gir, result.advanced_reasoning.result.meaning)


if __name__ == "__main__":
    unittest.main()

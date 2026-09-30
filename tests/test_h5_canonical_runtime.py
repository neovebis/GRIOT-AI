from __future__ import annotations

import unittest

from griot_reasoning_v040 import TruthStatus
from griot_runtime import GRIOTRuntime
from quid_core import Quid


class TestH5CanonicalRuntime(unittest.TestCase):
    def setUp(self) -> None:
        self.quid = Quid()
        self.runtime = GRIOTRuntime(self.quid)

    def test_quid_analysis_delegates_to_canonical_integration(self) -> None:
        calls = 0
        original = self.quid.integration.run

        def counted(*args, **kwargs):
            nonlocal calls
            calls += 1
            return original(*args, **kwargs)

        self.quid.integration.run = counted  # type: ignore[method-assign]
        self.quid.engine.learn("O lobo é um animal.", "memory")

        result = self.quid.analisar("O lobo é um animal?")

        self.assertEqual(calls, 1)
        self.assertEqual(result.epistemic_status, TruthStatus.SUPPORTED)
        self.assertTrue(result.answer)

    def test_runtime_analyze_uses_same_canonical_path(self) -> None:
        calls = 0
        original = self.quid.integration.run

        def counted(*args, **kwargs):
            nonlocal calls
            calls += 1
            return original(*args, **kwargs)

        self.quid.integration.run = counted  # type: ignore[method-assign]
        self.quid.engine.learn("O lobo é um animal.", "memory")

        analysis = self.runtime.analyze("O lobo é um animal?")

        self.assertEqual(calls, 1)
        self.assertTrue(analysis.integrated)
        self.assertEqual(analysis.result.epistemic_status, TruthStatus.SUPPORTED)

    def test_legacy_analysis_retains_query_plan_and_working_graph(self) -> None:
        self.quid.engine.learn("O lobo é um animal.", "memory")
        result = self.quid.analisar("O lobo é um animal?")

        self.assertTrue(result.query_plan.targets)
        self.assertGreaterEqual(result.working_graph.evidence_count, 1)
        self.assertIs(result.gir, result.reasoning.meaning)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest

from griot_integration_pipeline import IntegratedReasoningResult
from griot_reasoning_v040 import TruthStatus
from quid_core import Quid


class TestH1IntegrationPipeline(unittest.TestCase):
    def setUp(self) -> None:
        self.quid = Quid()

    def test_single_runtime_path_connects_g1_query_planner_and_g3(self) -> None:
        self.quid.engine.learn(
            "O lobo é um animal. O animal é um ser vivo.",
            "memory",
        )

        result = self.quid.analisar_integrado("O lobo é um ser vivo?")

        self.assertIsInstance(result, IntegratedReasoningResult)
        self.assertEqual(result.gir.fingerprint(), result.advanced_reasoning.result.meaning.fingerprint())
        self.assertEqual(result.base_reasoning.status, TruthStatus.SUPPORTED)
        self.assertEqual(result.epistemic_status, TruthStatus.SUPPORTED)
        self.assertTrue(result.verification_ok)
        self.assertTrue(result.query_plan.targets)
        self.assertGreater(result.working_graph.evidence_count, 0)
        self.assertEqual(result.next_operation, "stop")
        self.assertIn("query", {record.source for record in self.quid.engine.context.records()})

    def test_pipeline_keeps_unknown_as_explicit_next_operation(self) -> None:
        result = self.quid.analisar_integrado("A é uma entidade desconhecida?")

        self.assertEqual(result.epistemic_status, TruthStatus.UNKNOWN)
        self.assertTrue(result.abstained)
        self.assertEqual(result.next_operation, "retrieve_more_evidence")

    def test_g2_acquisition_feeds_the_same_g1_to_g3_pipeline(self) -> None:
        report, result = self.quid.adquirir_e_analisar(
            "O leão é um animal.",
            source="book-1",
            document_id="lion-1",
            query="O leão é um animal?",
        )

        self.assertTrue(report.changed)
        self.assertEqual(len(report.facts), 1)
        self.assertEqual(result.epistemic_status, TruthStatus.SUPPORTED)
        self.assertEqual(result.advanced_reasoning.strategy, "direct")
        self.assertEqual(result.query_plan.gir_fingerprint, result.gir.fingerprint())
        self.assertTrue(result.verification_ok)

    def test_shared_compiled_gir_is_reused_for_non_decomposed_queries(self) -> None:
        self.quid.engine.learn("O gato é um animal.", "memory")

        result = self.quid.analisar_integrado(
            "O gato é um animal?",
            decompose=False,
        )

        self.assertEqual(
            result.gir.fingerprint(),
            result.advanced_reasoning.result.meaning.fingerprint(),
        )
        self.assertEqual(
            result.base_reasoning.meaning.fingerprint(),
            result.gir.fingerprint(),
        )


if __name__ == "__main__":
    unittest.main()

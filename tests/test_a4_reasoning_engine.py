import unittest

from griot_engine import GRIOT
from griot_reasoning_v040 import ReasoningController, ReasoningEngine, TruthStatus
from griot_semantic_ir import SemanticGRIOT
from quid_core import Quid


class UnifiedReasoningEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.reasoning = ReasoningEngine(SemanticGRIOT(self.engine))
        self.quid = Quid(self.engine)

    def test_quid_uses_unified_reasoning_engine(self) -> None:
        self.assertIsInstance(self.quid.reasoning, ReasoningEngine)
        self.assertNotIsInstance(self.quid.reasoning, ReasoningController)

    def test_all_claims_are_evaluated(self) -> None:
        self.engine.learn("O leão é um animal. O leão é um mamífero.", source="facts")
        result = self.quid.analisar("leão é um animal. leão é um mamífero")
        self.assertEqual(result.epistemic_status, TruthStatus.SUPPORTED)
        self.assertEqual(len(result.reasoning.claims), 2)
        self.assertEqual(result.confidence, 0.92)

    def test_one_refuted_claim_refutes_a_conjunctive_query(self) -> None:
        self.engine.learn("O leão é um animal. O leão não é um mamífero.", source="facts")
        result = self.quid.analisar("leão é um animal. leão é um mamífero")
        self.assertEqual(result.epistemic_status, TruthStatus.REFUTED)
        self.assertFalse(result.answer)
        self.assertEqual(
            [claim.status for claim in result.reasoning.claims],
            [TruthStatus.SUPPORTED, TruthStatus.REFUTED],
        )

    def test_negative_query_polarity_is_respected(self) -> None:
        self.engine.learn("O leão é um mamífero.", source="positive")
        self.assertEqual(
            self.quid.analisar("leão não é um mamífero").epistemic_status,
            TruthStatus.REFUTED,
        )

        self.engine.learn("O lobo não é um mamífero.", source="negative")
        negative = self.quid.analisar("lobo não é um mamífero")
        self.assertEqual(negative.epistemic_status, TruthStatus.SUPPORTED)
        self.assertTrue(negative.answer)

    def test_conflict_is_reported_for_both_polarities(self) -> None:
        self.engine.learn("O leão é um mamífero.", source="positive")
        self.engine.learn("O leão não é um mamífero.", source="negative")
        result = self.quid.analisar("leão não é um mamífero")
        self.assertEqual(result.epistemic_status, TruthStatus.CONFLICT)
        self.assertIsNone(result.answer)
        self.assertEqual(result.reasoning.claims[0].requested_negated, True)

    def test_context_is_carried_without_becoming_truth_evidence(self) -> None:
        self.engine.learn("O leão é um animal.", source="memory")
        first = self.quid.analisar("leão é um animal")
        self.assertEqual(first.epistemic_status, TruthStatus.SUPPORTED)
        self.assertFalse(first.context.matches)

        second = self.quid.analisar("leão é um animal")
        self.assertEqual(second.epistemic_status, TruthStatus.SUPPORTED)
        self.assertTrue(second.context.matches)
        self.assertTrue(
            all(
                step.rule in {"direct", "support"} or step.rule.startswith("transitive:")
                for step in second.reasoning.proofs
            )
        )


if __name__ == "__main__":
    unittest.main()

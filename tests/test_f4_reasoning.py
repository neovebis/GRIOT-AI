import unittest

from griot_reasoning_v040 import ReasoningEngine, TruthStatus
from griot_semantic_ir import SemanticGRIOT
from griot_engine import Fact, GRIOT
from quid_core import Quid


class ReasoningContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.semantic = SemanticGRIOT(self.engine)
        self.reasoning = ReasoningEngine(self.semantic)

    def test_direct_support(self) -> None:
        self.semantic.learn("O leão é um animal.", source="a")
        result = self.reasoning.reason("leão é um animal")
        self.assertEqual(result.status, TruthStatus.SUPPORTED)
        self.assertEqual(result.claims[0].status, TruthStatus.SUPPORTED)

    def test_direct_refutation(self) -> None:
        self.semantic.learn("O leão não é um animal.", source="a")
        result = self.reasoning.reason("leão é um animal")
        self.assertEqual(result.status, TruthStatus.REFUTED)

    def test_unknown_is_not_refutation(self) -> None:
        result = self.reasoning.reason("leão é uma galáxia")
        self.assertEqual(result.status, TruthStatus.UNKNOWN)

    def test_conflict_is_not_support(self) -> None:
        self.semantic.learn("O leão é um animal.", source="a")
        self.semantic.learn("O leão não é um animal.", source="b")
        result = self.reasoning.reason("leão é um animal")
        self.assertEqual(result.status, TruthStatus.CONFLICT)

    def test_transitive_multi_hop_proof(self) -> None:
        self.semantic.learn("O leão é um animal.", source="a")
        self.semantic.learn("O animal é um ser vivo.", source="b")
        result = self.reasoning.reason("leão é um ser vivo")
        self.assertEqual(result.status, TruthStatus.SUPPORTED)
        self.assertTrue(
            any(
                step.rule in {"type_transitivity", "transitive:type"}
                for step in result.proofs
            )
        )

    def test_negative_query_can_be_supported(self) -> None:
        self.semantic.learn("O leão não é um planeta.", source="a")
        result = self.reasoning.reason("leão não é um planeta")
        self.assertEqual(result.status, TruthStatus.SUPPORTED)
        self.assertTrue(result.proofs)

    def test_all_query_edges_are_aggregated(self) -> None:
        self.semantic.learn("O leão é um animal.", source="a")
        self.semantic.learn("O lobo é um animal.", source="b")
        result = self.reasoning.reason("O leão é um animal. O lobo é um animal.")
        self.assertEqual(result.status, TruthStatus.SUPPORTED)
        self.assertGreaterEqual(len(result.claims), 2)

    def test_context_is_not_truth_evidence(self) -> None:
        gir = self.semantic.understand("O leão é um animal.")
        self.engine.context.ingest(gir, source="conversation")
        result = self.reasoning.reason("leão é um animal")
        self.assertEqual(result.status, TruthStatus.UNKNOWN)

    def test_quid_pipeline_preserves_reasoning_contract(self) -> None:
        self.engine.learn("O leão é um animal.", source="memory")
        analysis = Quid(self.engine).analisar("leão é um animal")
        self.assertEqual(analysis.reasoning.status, TruthStatus.SUPPORTED)
        self.assertTrue(analysis.verification.ok)
        self.assertTrue(analysis.answer)


if __name__ == "__main__":
    unittest.main()

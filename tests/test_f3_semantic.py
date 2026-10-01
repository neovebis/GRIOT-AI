import unittest

from griot_ambiguity import AmbiguityResolver
from griot_intent import IntentType
from griot_runtime import GRIOTRuntime
from griot_semantic_ir import SemanticGRIOT
from griot_engine import GRIOT


class SemanticCrossLayerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.semantic = SemanticGRIOT(self.engine)
        self.runtime = GRIOTRuntime()

    def test_ambiguity_and_polysemy_coexist(self) -> None:
        gir = self.semantic.understand("A raiz de uma equação é complexa.")
        self.assertIn("ambiguity", gir.constraints)
        self.assertIn("polysemy", gir.constraints)
        self.assertTrue(gir.constraints["polysemy"])

    def test_coreference_and_discourse_are_separate_layers(self) -> None:
        first = self.runtime.analyze("O leão viu a árvore.")
        second = self.runtime.analyze("Ela tem folhas.")

        self.assertEqual(second.result.discourse.transition.relation.value, "continuation")
        self.assertTrue(second.result.gir.constraints["coreference"])
        link = second.result.gir.constraints["coreference"][0]
        self.assertEqual(link["antecedent"], "árvore")

    def test_metaphor_does_not_become_a_graph_fact(self) -> None:
        before = set(self.runtime.quid.engine.graph.facts())
        result = self.runtime.analyze("Encontrámos a raiz do problema.")
        after = set(self.runtime.quid.engine.graph.facts())

        self.assertEqual(before, after)
        self.assertEqual(result.result.gir.constraints["metaphor"]["status"], "resolved")

    def test_intent_is_independent_from_epistemic_truth(self) -> None:
        result = self.runtime.analyze("Compara leão e lobo.")
        self.assertEqual(result.result.intent.primary, IntentType.COMPARISON)
        self.assertIn(result.result.epistemic_status.value, {"unknown", "supported", "refuted", "conflict"})

    def test_all_semantic_layers_round_trip_together(self) -> None:
        gir = self.semantic.understand(
            "O banco tem uma conta. Explica por que o banco está aberto."
        )
        restored = type(gir).from_json(gir.canonical_json())
        self.assertEqual(restored.constraints, gir.constraints)
        self.assertEqual(restored.nodes, gir.nodes)
        self.assertEqual(restored.edges, gir.edges)

    def test_runtime_stage_order_is_stable(self) -> None:
        a = self.runtime.analyze("O banco tem uma conta.")
        b = self.runtime.analyze("O banco tem uma conta.")
        self.assertEqual(a.stages, b.stages)
        self.assertTrue(a.integrated)
        self.assertTrue(b.integrated)


if __name__ == "__main__":
    unittest.main()

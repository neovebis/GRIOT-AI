import unittest

from griot_semantic_ir import SemanticGRIOT


class SemanticIRTests(unittest.TestCase):
    def setUp(self) -> None:
        self.griot = SemanticGRIOT()

    def test_event_has_atomic_scene_quid_and_roles(self):
        meaning = self.griot.understand("O leão ataca a presa ontem.")
        self.assertEqual(meaning.frame.intent, "query")
        self.assertTrue(any(edge.relation == "attacks" for edge in meaning.edges))
        self.assertTrue(any(edge.relation == "has_agent" for edge in meaning.edges))
        self.assertTrue(any(edge.relation == "has_patient" for edge in meaning.edges))
        self.assertTrue(any(edge.relation == "temporal" for edge in meaning.edges))
        self.assertTrue(all(len(node.quid) == 1 for node in meaning.nodes))

    def test_negation_and_modality_survive_compilation(self):
        meaning = self.griot.understand("O leão não pode atacar a presa.")
        self.assertTrue(meaning.constraints["negated"])
        attack = [edge for edge in meaning.edges if edge.relation == "attacks"]
        self.assertEqual(len(attack), 1)
        self.assertTrue(attack[0].negated)
        self.assertTrue(any(edge.relation == "modal" for edge in meaning.edges))

    def test_reference_resolution_reuses_subject(self):
        meaning = self.griot.understand("O leão é um animal. Ele tem juba.")
        has_edges = [edge for edge in meaning.edges if edge.relation == "has"]
        self.assertEqual(len(has_edges), 1)
        source = next(node for node in meaning.nodes if node.node_id == has_edges[0].source)
        self.assertEqual(source.quid, "🦁")

    def test_numeric_meaning_vector_is_deterministic(self):
        a = self.griot.meaning_similarity("O leão ataca a presa.", "O leão ataca a presa.")
        b = self.griot.meaning_similarity("O leão ataca a presa.", "O leão ataca a presa.")
        self.assertAlmostEqual(a, 1.0, places=6)
        self.assertEqual(a, b)

    def test_learning_inserts_compiled_facts(self):
        added = self.griot.learn(
            "O leão é um animal. O animal é um ser vivo.",
            source="unit-test",
        )
        self.assertGreaterEqual(added, 2)
        self.assertTrue(self.griot.engine.ask("leão é um ser vivo").answer)


if __name__ == "__main__":
    unittest.main()

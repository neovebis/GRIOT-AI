import unittest

from griot_metaphor import MetaphorResolver
from griot_semantic_ir import SemanticGRIOT
from griot_engine import GRIOT


class MetaphorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.semantic = SemanticGRIOT(self.engine)
        self.metaphor = MetaphorResolver()

    def test_known_metaphor_is_explicitly_interpreted(self) -> None:
        result = self.metaphor.analyze(
            "A empresa abriu um braço da empresa no norte."
        )
        self.assertTrue(result.resolved)
        self.assertEqual(result.chosen.source_domain, "body")
        self.assertEqual(result.chosen.target_domain, "organization")
        self.assertIn("empresa", result.chosen.cues)

    def test_causal_metaphor_has_explicit_target_domain(self) -> None:
        result = self.metaphor.analyze("Precisamos encontrar a raiz do problema.")
        self.assertTrue(result.resolved)
        self.assertEqual(result.chosen.target_domain, "causality")

    def test_unrecognized_literal_text_has_no_metaphor(self) -> None:
        result = self.metaphor.analyze("A árvore tem uma raiz profunda.")
        self.assertEqual(result.status, "none")
        self.assertIsNone(result.chosen)

    def test_multiple_metaphors_are_preserved_independently(self) -> None:
        results = self.metaphor.analyze_many(
            ("A empresa tem um braço da empresa.", "Havia um mar de gente.")
        )
        self.assertEqual(len(results), 2)
        self.assertTrue(all(result.resolved for result in results))

    def test_gir_keeps_metaphor_separate_from_factual_edges(self) -> None:
        before = len(self.engine.graph.facts())
        meaning = self.semantic.understand("Precisamos encontrar a raiz do problema.")
        self.assertEqual(len(self.engine.graph.facts()), before)
        self.assertEqual(meaning.constraints["metaphor"]["status"], "resolved")
        self.assertEqual(
            meaning.constraints["metaphor"]["chosen"]["target_domain"],
            "causality",
        )

    def test_metaphor_metadata_survives_round_trip(self) -> None:
        meaning = self.semantic.understand("Havia um mar de gente.")
        restored = type(meaning).from_json(meaning.canonical_json())
        self.assertEqual(
            restored.constraints["metaphor"],
            meaning.constraints["metaphor"],
        )


if __name__ == "__main__":
    unittest.main()

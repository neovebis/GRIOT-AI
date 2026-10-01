import unittest

from griot_coreference import CoreferenceResolver, Mention
from griot_semantic_ir import SemanticGRIOT
from griot_engine import GRIOT


class CoreferenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.semantic = SemanticGRIOT(self.engine)
        self.resolver = CoreferenceResolver(self.engine)

    def test_local_gender_agreement_resolves_the_antecedent(self) -> None:
        meaning = self.semantic.understand("O leão viu a árvore. Ela tem folhas.")
        links = meaning.constraints["coreference"]

        self.assertEqual(len(links), 1)
        self.assertEqual(links[0]["anaphor"], "ela")
        self.assertEqual(links[0]["antecedent"], "árvore")
        self.assertEqual(links[0]["status"], "resolved")

        tree = next(node for node in meaning.nodes if node.surface == "árvore")
        has_edge = next(edge for edge in meaning.edges if edge.relation == "has")
        self.assertEqual(has_edge.source, tree.node_id)

    def test_ambiguous_same_gender_mentions_are_not_forced(self) -> None:
        meaning = self.semantic.understand("O leão viu o lobo. Ele tem fome.")
        link = meaning.constraints["coreference"][0]

        self.assertEqual(link["anaphor"], "ele")
        self.assertIsNone(link["antecedent"])
        self.assertEqual(link["status"], "ambiguous")
        self.assertGreaterEqual(len(link["candidates"]), 2)

    def test_gender_mismatch_is_filtered(self) -> None:
        mentions = (
            Mention("leão", "subject", 1, "masc", "sing", "🦁"),
            Mention("árvore", "object", 1, "fem", "sing", "🌳"),
        )
        link = self.resolver.resolve("ele", mentions)
        self.assertEqual(link.antecedent, "leão")
        self.assertEqual(link.status, "resolved")
        self.assertTrue(all(
            candidate.surface != "árvore"
            for candidate in link.candidates
        ))

    def test_prior_context_can_supply_an_antecedent(self) -> None:
        prior = self.semantic.understand("A árvore fica no parque.")
        self.engine.context.ingest(prior, source="prior")
        analysis = self.resolver.resolve(
            "ela",
            (),
            context_records=self.engine.context.records(),
        )

        self.assertEqual(analysis.status, "resolved")
        self.assertEqual(analysis.antecedent, "árvore")

    def test_unknown_pronoun_does_not_create_a_false_link(self) -> None:
        link = self.resolver.resolve("ele", ())
        self.assertEqual(link.status, "unresolved")
        self.assertIsNone(link.antecedent)

    def test_coreference_metadata_is_json_round_trip_safe(self) -> None:
        meaning = self.semantic.understand("O leão viu a árvore. Ela tem folhas.")
        restored = type(meaning).from_json(meaning.canonical_json())
        self.assertEqual(
            restored.constraints["coreference"],
            meaning.constraints["coreference"],
        )


if __name__ == "__main__":
    unittest.main()

import unittest

from griot_ambiguity import AmbiguityResolver
from griot_polysemy import PolysemyResolver
from griot_semantic_ir import SemanticGRIOT
from griot_engine import GRIOT


class PolysemyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.semantic = SemanticGRIOT(self.engine)
        self.polysemy = PolysemyResolver(self.engine)
        self.ambiguity = AmbiguityResolver(self.engine)

    def test_polysemous_family_is_explicit(self) -> None:
        analysis = self.polysemy.analyze("A cabeça da empresa e o corpo.")
        self.assertEqual(len(analysis.families), 1)
        family = analysis.families[0]
        self.assertEqual(family.surface, "cabeça")
        self.assertIn("head_body", family.senses)
        self.assertIn("head_leader", family.senses)
        self.assertTrue(any(link.relation == "metonymic_extension" for link in family.links))

    def test_related_senses_keep_distinct_quids(self) -> None:
        ambiguity = self.ambiguity.analyze("A cabeça da empresa tem um corpo.")
        quids = {
            candidate.sense: candidate.quid
            for candidate in ambiguity.resolutions[0].candidates
        }
        self.assertNotEqual(quids["head_body"], quids["head_leader"])

    def test_semantic_ir_preserves_polysemy_without_equating_senses(self) -> None:
        meaning = self.semantic.understand("A cabeça da empresa tem um papel.")
        poly = meaning.constraints["polysemy"][0]

        self.assertEqual(poly["surface"], "cabeça")
        self.assertIn("head_body", poly["senses"])
        self.assertIn("head_leader", poly["senses"])
        nodes = {node.surface: node.quid for node in meaning.nodes}
        self.assertIn("cabeça", nodes)
        self.assertNotEqual(
            next(
                candidate.quid
                for candidate in self.ambiguity.analyze("A cabeça da empresa.").resolutions[0].candidates
                if candidate.sense == "head_body"
            ),
            next(
                candidate.quid
                for candidate in self.ambiguity.analyze("A cabeça da empresa.").resolutions[0].candidates
                if candidate.sense == "head_leader"
            ),
        )

    def test_polysemy_links_do_not_create_durable_graph_facts(self) -> None:
        before = len(self.engine.graph.facts())
        self.semantic.understand("A raiz de uma equação é complexa.")
        self.assertEqual(len(self.engine.graph.facts()), before)

    def test_related_returns_only_links_touching_requested_sense(self) -> None:
        links = self.polysemy.related("cabeça", "head_body")
        self.assertTrue(links)
        self.assertTrue(all(
            link.source_sense == "head_body" or link.target_sense == "head_body"
            for link in links
        ))

    def test_polysemy_round_trip_survives_gir_serialization(self) -> None:
        meaning = self.semantic.understand("A raiz de uma equação é complexa.")
        restored = type(meaning).from_json(meaning.canonical_json())
        self.assertEqual(
            restored.constraints["polysemy"],
            meaning.constraints["polysemy"],
        )


if __name__ == "__main__":
    unittest.main()

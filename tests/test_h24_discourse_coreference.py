from __future__ import annotations

import unittest

from griot_engine import GRIOT
from griot_coreference import CoreferenceResolver, Mention


class H24DiscourseCoreferenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()

    def test_cross_sentence_subject_pronoun_resolves(self) -> None:
        result = self.engine.analisar(
            "O cão viu a floresta. Ele comeu a carne."
        )
        relations = {
            (edge.relation, edge.source, edge.target)
            for edge in result.gir.edges
            if edge.relation in {"sees", "eats"}
        }
        self.assertTrue(any(edge.relation == "eats" for edge in result.gir.edges))
        coref = result.gir.constraints["coreference"]
        self.assertEqual(coref[-1]["anaphor"], "ele")
        self.assertEqual(coref[-1]["antecedent"], "cão")
        self.assertEqual(coref[-1]["status"], "resolved")

    def test_cross_sentence_feminine_pronoun_resolves(self) -> None:
        result = self.engine.analisar(
            "A casa viu o lobo. Ela usa a madeira."
        )
        self.assertTrue(any(edge.relation == "uses" for edge in result.gir.edges))
        coref = result.gir.constraints["coreference"]
        self.assertEqual(coref[-1]["anaphor"], "ela")
        self.assertEqual(coref[-1]["antecedent"], "casa")

    def test_connector_depois_ele_resolves(self) -> None:
        result = self.engine.analisar(
            "O cão viu a floresta. Depois ele comeu a carne."
        )
        self.assertTrue(any(edge.relation == "eats" for edge in result.gir.edges))
        coref = result.gir.constraints["coreference"]
        self.assertEqual(coref[-1]["anaphor"], "ele")
        self.assertEqual(coref[-1]["antecedent"], "cão")

    def test_connector_e_ele_resolves(self) -> None:
        result = self.engine.analisar(
            "O cão viu a floresta. E ele comeu a carne."
        )
        self.assertTrue(any(edge.relation == "eats" for edge in result.gir.edges))
        coref = result.gir.constraints["coreference"]
        self.assertEqual(coref[-1]["antecedent"], "cão")

    def test_connector_mas_ela_resolves(self) -> None:
        result = self.engine.analisar(
            "A casa viu o lobo. Mas ela usa a madeira."
        )
        self.assertTrue(any(edge.relation == "uses" for edge in result.gir.edges))
        coref = result.gir.constraints["coreference"]
        self.assertEqual(coref[-1]["antecedent"], "casa")

    def test_same_sentence_ambiguity_still_abstains(self) -> None:
        result = self.engine.analisar(
            "O cão atacou o lobo. Ele viu a floresta."
        )
        coref = result.gir.constraints["coreference"]
        self.assertEqual(coref[-1]["anaphor"], "ele")
        self.assertEqual(coref[-1]["status"], "ambiguous")
        self.assertIsNone(coref[-1]["antecedent"])

    def test_cross_turn_context_resolves_single_compatible_entity(self) -> None:
        first = self.engine.analisar("O cão viu a floresta.")
        self.assertGreaterEqual(first.discourse.turn, 1)

        second = self.engine.analisar("Ele comeu a carne.")
        self.assertTrue(any(edge.relation == "eats" for edge in second.gir.edges))
        coref = second.gir.constraints["coreference"]
        self.assertEqual(coref[-1]["antecedent"], "cão")
        self.assertEqual(coref[-1]["status"], "resolved")

    def test_cross_turn_ambiguous_context_abstains(self) -> None:
        self.engine.analisar("O cão viu a floresta.")
        self.engine.analisar("O lobo atacou a floresta.")
        second = self.engine.analisar("Ele comeu a carne.")
        coref = second.gir.constraints["coreference"]
        self.assertEqual(coref[-1]["status"], "ambiguous")
        self.assertIsNone(coref[-1]["antecedent"])

    def test_unresolved_pronoun_does_not_fabricate_subject(self) -> None:
        result = self.engine.analisar("Ele comeu a carne.")
        coref = result.gir.constraints["coreference"]
        self.assertEqual(coref[-1]["status"], "unresolved")
        self.assertIsNone(coref[-1]["antecedent"])
        self.assertFalse(any(edge.relation == "eats" for edge in result.gir.edges))

    def test_plural_agreement_is_respected(self) -> None:
        result = self.engine.analisar(
            "Os animais agridem o lobo. Eles agridem a floresta."
        )
        coref = result.gir.constraints["coreference"]
        self.assertEqual(coref[-1]["anaphor"], "eles")
        self.assertEqual(coref[-1]["status"], "resolved")
        self.assertEqual(coref[-1]["antecedent"], "animais")

    def test_disourse_coreference_keeps_quids_atomic(self) -> None:
        result = self.engine.analisar(
            "O cão viu a floresta. Depois ele comeu a carne."
        )
        self.assertTrue(all(len(node.quid) == 1 for node in result.gir.nodes))

    def test_coreference_is_deterministic(self) -> None:
        sentence = "O cão viu a floresta. Depois ele comeu a carne."
        first = self.engine.analisar(sentence).gir.to_dict()
        self.engine.context.clear()
        self.engine.discourse.clear()
        second = self.engine.analisar(sentence).gir.to_dict()
        self.assertEqual(first, second)

    def test_direct_resolver_preserves_candidate_evidence(self) -> None:
        resolver = CoreferenceResolver(self.engine)
        mentions = (
            Mention("cão", "subject", 1, "masc", "sing", "q1"),
        )
        link = resolver.resolve("ele", mentions)
        self.assertEqual(link.status, "resolved")
        self.assertEqual(link.antecedent, "cão")
        self.assertTrue(link.candidates)
        self.assertIn("local-", link.candidates[0].reason)


if __name__ == "__main__":
    unittest.main()

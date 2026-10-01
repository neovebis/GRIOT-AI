from __future__ import annotations

import unittest

from griot_engine import GRIOT


class H25IntrasentenceCoreferenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()

    def test_coordinated_subject_pronoun_resolves(self) -> None:
        result = self.engine.analisar(
            "O cão viu a floresta e ele comeu a carne."
        )
        self.assertTrue(any(edge.relation == "sees" for edge in result.gir.edges))
        self.assertTrue(any(edge.relation == "eats" for edge in result.gir.edges))
        coref = result.gir.constraints["coreference"]
        self.assertTrue(any(link["anaphor"] == "ele" and link["antecedent"] == "cão" and link["status"] == "resolved" for link in coref))

    def test_coordinated_feminine_pronoun_resolves(self) -> None:
        result = self.engine.analisar(
            "A casa viu o lobo e ela usa a madeira."
        )
        self.assertTrue(any(edge.relation == "uses" for edge in result.gir.edges))
        coref = result.gir.constraints["coreference"]
        self.assertTrue(any(link["anaphor"] == "ela" and link["antecedent"] == "casa" for link in coref))

    def test_coordinated_connector_mas_resolves(self) -> None:
        result = self.engine.analisar(
            "O cão viu a floresta mas ele comeu a carne."
        )
        self.assertTrue(any(edge.relation == "eats" for edge in result.gir.edges))
        coref = result.gir.constraints["coreference"]
        self.assertTrue(any(link["anaphor"] == "ele" and link["antecedent"] == "cão" for link in coref))

    def test_second_coordinated_pronoun_can_use_first_resolved_clause(self) -> None:
        result = self.engine.analisar(
            "O cão viu a floresta e ele comeu a carne e ele atacou o lobo."
        )
        coref = [link for link in result.gir.constraints["coreference"] if link["anaphor"] == "ele"]
        self.assertGreaterEqual(len(coref), 2)
        self.assertTrue(all(link["status"] == "resolved" for link in coref))
        self.assertTrue(any(edge.relation == "eats" for edge in result.gir.edges))
        self.assertTrue(any(edge.relation == "attacks" for edge in result.gir.edges))

    def test_ambiguous_intrasentence_pronoun_abstains(self) -> None:
        result = self.engine.analisar(
            "O cão viu o lobo e ele comeu a carne."
        )
        coref = [link for link in result.gir.constraints["coreference"] if link["anaphor"] == "ele"]
        self.assertTrue(coref)
        self.assertEqual(coref[-1]["status"], "ambiguous")
        self.assertIsNone(coref[-1]["antecedent"])
        self.assertFalse(any(edge.relation == "eats" for edge in result.gir.edges))

    def test_unresolved_intrasentence_branch_is_blocked(self) -> None:
        result = self.engine.analisar(
            "A casa viu a floresta e ele comeu a carne."
        )
        coref = [link for link in result.gir.constraints["coreference"] if link["anaphor"] == "ele"]
        self.assertTrue(coref)
        self.assertIn(coref[-1]["status"], {"unresolved", "ambiguous"})
        self.assertIsNone(coref[-1]["antecedent"])
        self.assertFalse(any(edge.relation == "eats" for edge in result.gir.edges))

    def test_embedded_pronoun_resolves(self) -> None:
        result = self.engine.analisar(
            "O cão viu a floresta porque ele atacou o lobo."
        )
        self.assertTrue(any(edge.relation == "attacks" for edge in result.gir.edges))
        coref = result.gir.constraints["coreference"]
        self.assertTrue(any(link["anaphor"] == "ele" and link["antecedent"] == "cão" for link in coref))

    def test_h24_cross_sentence_coreference_remains_intact(self) -> None:
        result = self.engine.analisar(
            "O cão viu a floresta. Depois ele comeu a carne."
        )
        self.assertTrue(any(edge.relation == "eats" for edge in result.gir.edges))
        coref = result.gir.constraints["coreference"]
        self.assertTrue(any(link["anaphor"] == "ele" and link["antecedent"] == "cão" for link in coref))

    def test_h21_possessive_relative_remains_intact(self) -> None:
        result = self.engine.analisar(
            "O cão cujo dono atacou o lobo e ele viu a floresta."
        )
        self.assertTrue(any(edge.relation == "has" for edge in result.gir.edges))
        self.assertTrue(any(link["anaphor"] == "ele" for link in result.gir.constraints["coreference"]))

    def test_h23_nested_relative_remains_structural(self) -> None:
        result = self.engine.analisar(
            "O cão que viu o lobo que atacou a floresta e ele comeu a carne."
        )
        self.assertTrue(any(edge.relation == "sees" for edge in result.gir.edges))
        self.assertTrue(any(edge.relation == "attacks" for edge in result.gir.edges))

    def test_atomic_quids_are_preserved(self) -> None:
        result = self.engine.analisar(
            "O cão viu a floresta e ele comeu a carne."
        )
        self.assertTrue(all(len(node.quid) == 1 for node in result.gir.nodes))

    def test_intrasentence_coreference_is_deterministic(self) -> None:
        sentence = "O cão viu a floresta e ele comeu a carne."
        first = self.engine.analisar(sentence).gir.to_dict()
        self.engine.context.clear()
        self.engine.discourse.clear()
        second = self.engine.analisar(sentence).gir.to_dict()
        self.assertEqual(first, second)

    def test_resolved_pronoun_preserves_coordinated_metadata(self) -> None:
        result = self.engine.analisar(
            "O cão viu a floresta e ele comeu a carne."
        )
        root = result.gir.constraints["language"]["clauses"][0]
        self.assertEqual(root["coordinator"], "e")
        self.assertEqual(root["coordinated"][0]["subject"], "cão")

    def test_coreference_evidence_is_present(self) -> None:
        result = self.engine.analisar(
            "O cão viu a floresta e ele comeu a carne."
        )
        link = next(
            item for item in result.gir.constraints["coreference"]
            if item["anaphor"] == "ele"
        )
        self.assertTrue(link["candidates"])
        self.assertGreaterEqual(link["confidence"], 0.0)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest

from griot_engine import GRIOT


class H27CliticCoreferenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()

    def test_o_clitic_resolves_across_sentences(self) -> None:
        result = self.engine.analisar(
            "O cão viu a casa. O lobo viu-o."
        )
        links = [x for x in result.gir.constraints["coreference"] if x["anaphor"] == "o"]
        self.assertTrue(links)
        self.assertEqual(links[-1]["status"], "resolved")
        self.assertEqual(links[-1]["antecedent"], "cão")
        self.assertTrue(any(edge.relation == "sees" for edge in result.gir.edges))

    def test_a_clitic_resolves_across_sentences(self) -> None:
        result = self.engine.analisar(
            "A casa viu o lobo. O cão viu-a."
        )
        links = [x for x in result.gir.constraints["coreference"] if x["anaphor"] == "a"]
        self.assertEqual(links[-1]["status"], "resolved")
        self.assertEqual(links[-1]["antecedent"], "casa")

    def test_plural_os_clitic_resolves(self) -> None:
        result = self.engine.analisar(
            "Os animais agridem a casa. O cão viu-os."
        )
        links = [x for x in result.gir.constraints["coreference"] if x["anaphor"] == "os"]
        self.assertEqual(links[-1]["status"], "resolved")
        self.assertEqual(links[-1]["antecedent"], "animais")

    def test_plural_as_clitic_resolves(self) -> None:
        result = self.engine.analisar(
            "As casas usam madeira. O cão viu-as."
        )
        links = [x for x in result.gir.constraints["coreference"] if x["anaphor"] == "as"]
        self.assertEqual(links[-1]["status"], "resolved")
        self.assertEqual(links[-1]["antecedent"], "casas")

    def test_clitic_in_coordinate_clause_resolves(self) -> None:
        result = self.engine.analisar(
            "O cão viu a casa e o lobo viu-o."
        )
        links = [x for x in result.gir.constraints["coreference"] if x["anaphor"] == "o"]
        self.assertTrue(links)
        self.assertEqual(
            links[-1]["antecedent"],
            "cão",
            msg=f"link={links[-1]!r}",
        )
        self.assertEqual(
            links[-1]["status"],
            "resolved",
            msg=f"link={links[-1]!r}",
        )

    def test_clitic_surface_marker_is_preserved(self) -> None:
        result = self.engine.analisar(
            "O cão viu a casa. O lobo viu-o."
        )
        root = result.gir.constraints["language"]["clauses"][-1]
        self.assertEqual(root["clitic_marker"], "o")
        self.assertEqual(root["clitic_role"], "object")

    def test_clitic_rewrites_object_to_antecedent(self) -> None:
        result = self.engine.analisar(
            "O cão viu a casa. O lobo viu-o."
        )
        root = result.gir.constraints["language"]["clauses"][-1]
        self.assertEqual(
            root["object"],
            "cão",
            msg=f"serialized clitic clause={root!r}",
        )

    def test_unresolved_clitic_abstains(self) -> None:
        result = self.engine.analisar(
            "O lobo viu-o."
        )
        links = [x for x in result.gir.constraints["coreference"] if x["anaphor"] == "o"]
        self.assertEqual(links[-1]["status"], "unresolved")
        self.assertIsNone(links[-1]["antecedent"])

    def test_ambiguous_clitic_abstains(self) -> None:
        result = self.engine.analisar(
            "O cão viu o lobo. A casa viu-o."
        )
        links = [x for x in result.gir.constraints["coreference"] if x["anaphor"] == "o"]
        self.assertEqual(links[-1]["status"], "ambiguous")
        self.assertIsNone(links[-1]["antecedent"])

    def test_lo_variant_resolves(self) -> None:
        result = self.engine.analisar(
            "O cão viu a casa. O lobo viu-lo."
        )
        links = [x for x in result.gir.constraints["coreference"] if x["anaphor"] == "lo"]
        self.assertEqual(links[-1]["status"], "resolved")
        self.assertEqual(links[-1]["antecedent"], "cão")

    def test_feminine_la_variant_resolves(self) -> None:
        result = self.engine.analisar(
            "A casa viu o lobo. O cão viu-la."
        )
        links = [x for x in result.gir.constraints["coreference"] if x["anaphor"] == "la"]
        self.assertEqual(links[-1]["status"], "resolved")
        self.assertEqual(links[-1]["antecedent"], "casa")

    def test_articles_are_not_treated_as_clitics_without_hyphen(self) -> None:
        analysis = self.engine.analisar(
            "O cão viu a casa."
        )
        self.assertFalse(any(
            link["anaphor"] in {"o", "a", "os", "as"}
            for link in analysis.gir.constraints["coreference"]
        ))

    def test_h26_object_pronoun_remains_intact(self) -> None:
        result = self.engine.analisar(
            "O cão viu a casa. O lobo viu ele."
        )
        links = [x for x in result.gir.constraints["coreference"] if x["anaphor"] == "ele"]
        self.assertEqual(links[-1]["antecedent"], "cão")

    def test_clitic_is_deterministic_and_quids_atomic(self) -> None:
        sentence = "O cão viu a casa. O lobo viu-o."
        first = self.engine.analisar(sentence).gir.to_dict()
        self.engine.context.clear()
        self.engine.discourse.clear()
        second = self.engine.analisar(sentence).gir.to_dict()
        self.assertEqual(first, second)
        self.assertTrue(all(len(node.quid) == 1 for node in self.engine.analisar(sentence).gir.nodes))


if __name__ == "__main__":
    unittest.main()

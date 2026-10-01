from __future__ import annotations

import unittest

from griot_engine import GRIOT


class H26ObjectCoreferenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()

    def test_object_pronoun_resolves_in_coordinate_clause(self) -> None:
        result = self.engine.analisar(
            "O cão viu a floresta e a casa viu ele."
        )
        self.assertTrue(any(edge.relation == "sees" for edge in result.gir.edges))
        links = [x for x in result.gir.constraints["coreference"] if x["anaphor"] == "ele"]
        self.assertTrue(links)
        self.assertEqual(links[-1]["antecedent"], "cão")
        self.assertEqual(links[-1]["status"], "resolved")

    def test_object_pronoun_resolves_across_sentences(self) -> None:
        result = self.engine.analisar(
            "O cão viu a floresta. A casa viu ele."
        )
        self.assertTrue(any(edge.relation == "sees" for edge in result.gir.edges))
        links = [x for x in result.gir.constraints["coreference"] if x["anaphor"] == "ele"]
        self.assertEqual(links[-1]["antecedent"], "cão")

    def test_object_pronoun_resolves_feminine(self) -> None:
        result = self.engine.analisar(
            "A casa viu o lobo. O cão viu ela."
        )
        links = [x for x in result.gir.constraints["coreference"] if x["anaphor"] == "ela"]
        self.assertEqual(links[-1]["antecedent"], "casa")
        self.assertEqual(links[-1]["status"], "resolved")

    def test_object_pronoun_resolves_plural(self) -> None:
        result = self.engine.analisar(
            "Os animais agridem a casa. O cão viu eles."
        )
        links = [x for x in result.gir.constraints["coreference"] if x["anaphor"] == "eles"]
        self.assertEqual(links[-1]["antecedent"], "animais")
        self.assertEqual(links[-1]["status"], "resolved")

    def test_ambiguous_object_pronoun_abstains(self) -> None:
        result = self.engine.analisar(
            "O cão viu o lobo. A casa viu ele."
        )
        links = [x for x in result.gir.constraints["coreference"] if x["anaphor"] == "ele"]
        self.assertEqual(links[-1]["status"], "ambiguous")
        self.assertIsNone(links[-1]["antecedent"])

    def test_unresolved_object_pronoun_blocks_clause(self) -> None:
        result = self.engine.analisar(
            "A casa viu ele."
        )
        links = [x for x in result.gir.constraints["coreference"] if x["anaphor"] == "ele"]
        self.assertEqual(links[-1]["status"], "unresolved")
        self.assertIsNone(links[-1]["antecedent"])
        self.assertFalse(any(edge.relation == "sees" for edge in result.gir.edges))

    def test_subject_and_object_pronouns_can_resolve_in_same_clause(self) -> None:
        result = self.engine.analisar(
            "O cão viu a casa e ele viu ela."
        )
        links = result.gir.constraints["coreference"]
        resolved = {
            item["anaphor"]: item["antecedent"]
            for item in links
            if item["status"] == "resolved"
        }
        self.assertEqual(resolved.get("ele"), "cão")
        self.assertEqual(resolved.get("ela"), "casa")

    def test_object_coreference_updates_language_tree(self) -> None:
        result = self.engine.analisar(
            "O cão viu a floresta e a casa viu ele."
        )
        root = result.gir.constraints["language"]["clauses"][0]
        self.assertEqual(root["coordinated"][0]["object"], "cão")
        self.assertFalse(root["coordinated"][0]["coreference_blocked"])

    def test_blocked_object_is_serialized(self) -> None:
        result = self.engine.analisar(
            "A casa viu ele."
        )
        root = result.gir.constraints["language"]["clauses"][0]
        self.assertTrue(root["coreference_blocked"])

    def test_object_coreference_keeps_atomic_quids(self) -> None:
        result = self.engine.analisar(
            "O cão viu a floresta e a casa viu ele."
        )
        self.assertTrue(all(len(node.quid) == 1 for node in result.gir.nodes))

    def test_object_coreference_is_deterministic(self) -> None:
        sentence = "O cão viu a floresta e a casa viu ele."
        first = self.engine.analisar(sentence).gir.to_dict()
        self.engine.context.clear()
        self.engine.discourse.clear()
        second = self.engine.analisar(sentence).gir.to_dict()
        self.assertEqual(first, second)

    def test_h25_subject_coreference_remains_intact(self) -> None:
        result = self.engine.analisar(
            "O cão viu a floresta e ele comeu a carne."
        )
        links = [x for x in result.gir.constraints["coreference"] if x["anaphor"] == "ele"]
        self.assertEqual(links[-1]["antecedent"], "cão")

    def test_h24_cross_sentence_subject_coreference_remains_intact(self) -> None:
        result = self.engine.analisar(
            "O cão viu a floresta. Depois ele comeu a carne."
        )
        links = [x for x in result.gir.constraints["coreference"] if x["anaphor"] == "ele"]
        self.assertEqual(links[-1]["antecedent"], "cão")

    def test_nested_relative_structure_remains_intact(self) -> None:
        result = self.engine.analisar(
            "O cão que viu o lobo que atacou a floresta e a casa viu ele."
        )
        self.assertTrue(any(edge.relation == "attacks" for edge in result.gir.edges))
        self.assertTrue(any(edge.relation == "sees" for edge in result.gir.edges))


if __name__ == "__main__":
    unittest.main()

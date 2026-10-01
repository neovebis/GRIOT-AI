from __future__ import annotations

import unittest

from griot_engine import GRIOT
from griot_language import LanguageIntelligence
from griot_semantic_ir import SemanticGRIOT


class H22MultipleRelativeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.language = LanguageIntelligence()
        self.semantic = SemanticGRIOT(self.engine)

    def test_multiple_subject_relative_detector_is_structural(self) -> None:
        parts = self.language._split_multiple_relatives(
            "O cão que atacou o lobo e que viu a floresta comeu a carne."
        )
        self.assertIsNotNone(parts, msg=f"multiple-relative parts={parts!r}")
        assert parts is not None
        main_text, relatives, antecedent = parts
        self.assertEqual(main_text, "cão comeu a carne")
        self.assertEqual(antecedent, "cão")
        self.assertEqual(len(relatives), 2)

    def test_two_subject_relatives_become_siblings(self) -> None:
        clause = self.language.analyze(
            "O cão que atacou o lobo e que viu a floresta comeu a carne."
        ).clauses[0]
        self.assertEqual(clause.subject, "cão")
        self.assertEqual(clause.relation, "eats")
        self.assertEqual(len(clause.relative), 2)
        self.assertEqual(
            [(x.relativizer, x.relation, x.subject, x.object) for x in clause.relative],
            [
                ("que", "attacks", "cão", "lobo"),
                ("que", "sees", "cão", "floresta"),
            ],
        )

    def test_two_object_relatives_become_siblings(self) -> None:
        clause = self.language.analyze(
            "O lobo viu o cão que atacou a floresta e que comeu a carne."
        ).clauses[0]
        self.assertEqual(clause.object, "cão")
        self.assertEqual(clause.relation, "sees")
        self.assertEqual(len(clause.relative), 2)
        self.assertEqual(
            [(x.relation, x.subject, x.object) for x in clause.relative],
            [
                ("attacks", "cão", "floresta"),
                ("eats", "cão", "carne"),
            ],
        )

    def test_multiple_relative_provenance_is_branch_distinct(self) -> None:
        meaning = self.semantic.understand(
            "O cão que atacou o lobo e que viu a floresta comeu a carne."
        )
        provenances = {
            edge.provenance
            for edge in meaning.edges
            if edge.relation in {"attacks", "sees"}
        }
        self.assertIn("relative:1:que", provenances)
        self.assertIn("relative:1:que.1", provenances)

    def test_multiple_relative_compilation_preserves_all_relations(self) -> None:
        meaning = self.semantic.understand(
            "O cão que atacou o lobo e que viu a floresta comeu a carne."
        )
        relations = {edge.relation for edge in meaning.edges}
        self.assertTrue({"attacks", "sees", "eats"}.issubset(relations))

    def test_unknown_second_relative_does_not_destroy_first_or_main(self) -> None:
        clause = self.language.analyze(
            "O cão que atacou o lobo e que acariciou a floresta comeu a carne."
        ).clauses[0]
        self.assertEqual(clause.relation, "eats")
        self.assertEqual(len(clause.relative), 1)
        self.assertEqual(clause.relative[0].relation, "attacks")

    def test_first_unknown_relative_does_not_destroy_main(self) -> None:
        clause = self.language.analyze(
            "O cão que acariciou o lobo e que viu a floresta comeu a carne."
        ).clauses[0]
        self.assertEqual(clause.relation, "eats")
        self.assertEqual(len(clause.relative), 1)
        self.assertEqual(clause.relative[0].relation, "sees")

    def test_relative_children_keep_individual_markers(self) -> None:
        clause = self.language.analyze(
            "O cão que atacou o lobo e que viu a floresta comeu a carne."
        ).clauses[0]
        self.assertEqual(tuple(x.relativizer for x in clause.relative), ("que", "que"))

    def test_object_multiple_relative_metadata_is_serialized(self) -> None:
        meaning = self.semantic.understand(
            "O lobo viu o cão que atacou a floresta e que comeu a carne."
        )
        root = meaning.constraints["language"]["clauses"][0]
        self.assertEqual(len(root["relative"]), 2)
        self.assertEqual(root["relative"][0]["relativizer"], "que")
        self.assertEqual(root["relative"][1]["relativizer"], "que")

    def test_atomic_quids_survive_multiple_relative_compilation(self) -> None:
        meaning = self.semantic.understand(
            "O cão que atacou o lobo e que viu a floresta comeu a carne."
        )
        self.assertTrue(all(len(node.quid) == 1 for node in meaning.nodes))

    def test_multiple_relative_compilation_is_deterministic(self) -> None:
        sentence = "O cão que atacou o lobo e que viu a floresta comeu a carne."
        snapshots = [
            self.semantic.understand(sentence).to_dict()
            for _ in range(20)
        ]
        self.assertEqual(len({repr(item) for item in snapshots}), 1)

    def test_h21_possessive_relatives_remain_intact(self) -> None:
        clause = self.language.analyze(
            "O cão cujo dono atacou o lobo viu a floresta."
        ).clauses[0]
        self.assertEqual(clause.possessive_marker, "cujo")
        self.assertEqual(clause.possessed, "dono")

    def test_nested_relative_coordination_remains_structural(self) -> None:
        clause = self.language.analyze(
            "O cão que atacou o lobo e que viu a floresta comeu a carne e o urso viu o cão."
        ).clauses[0]
        self.assertEqual(len(clause.relative), 2)
        self.assertEqual(clause.relation, "eats")
        self.assertEqual(clause.coordinator, "e")
        self.assertEqual(clause.coordinated[0].relation, "sees")


if __name__ == "__main__":
    unittest.main()

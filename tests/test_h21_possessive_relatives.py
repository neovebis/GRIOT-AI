from __future__ import annotations

import unittest

from griot_engine import GRIOT
from griot_language import LanguageIntelligence
from griot_semantic_ir import SemanticGRIOT


class H21PossessiveRelativeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.language = LanguageIntelligence()
        self.semantic = SemanticGRIOT(self.engine)

    def test_cujo_builds_explicit_possession(self) -> None:
        clause = self.language.analyze(
            "O cão cujo dono atacou o lobo viu a floresta."
        ).clauses[0]
        self.assertEqual(clause.relativizer, "cujo")
        self.assertEqual(clause.relativizer_kind, "possessive")
        self.assertEqual(clause.relative_binding, "possessor")
        self.assertEqual(clause.relative_antecedent, "cão")
        self.assertEqual(clause.possessive_marker, "cujo")
        self.assertEqual(clause.possessive_antecedent, "cão")
        self.assertEqual(clause.possessed, "dono")
        self.assertEqual(clause.relative[0].relation, "attacks")

    def test_explicit_relative_subject_is_not_included_in_possessed_np(self) -> None:
        clause = self.language.analyze(
            "A casa cuja porta o lobo atacou viu a floresta."
        ).clauses[0]
        self.assertEqual(clause.possessed, "porta")
        self.assertEqual(clause.relative[0].subject, "lobo")
        self.assertEqual(clause.relative[0].relation, "attacks")
        self.assertEqual(clause.relative[0].object, "porta")

    def test_cuja_and_plural_forms_preserve_ownership(self) -> None:
        for sentence, marker, possessed in (
            (
                "A casa cuja porta o lobo atacou viu a floresta.",
                "cuja",
                "porta",
            ),
            (
                "Os cães cujos donos atacaram o lobo comem a carne.",
                "cujos",
                "donos",
            ),
            (
                "As casas cujas portas o lobo atacou usam madeira.",
                "cujas",
                "portas",
            ),
        ):
            clause = self.language.analyze(sentence).clauses[0]
            self.assertEqual(clause.relativizer, marker)
            self.assertEqual(clause.relativizer_kind, "possessive")
            self.assertEqual(clause.possessed, possessed)

    def test_possession_reaches_gir_as_has(self) -> None:
        meaning = self.semantic.understand(
            "O cão cujo dono atacou o lobo viu a floresta."
        )
        self.assertTrue(
            any(
                edge.relation == "has"
                and edge.provenance == "possessive:1:cujo"
                for edge in meaning.edges
            )
        )
        self.assertTrue(
            any(
                edge.relation == "attacks"
                and edge.provenance == "relative:1:cujo"
                for edge in meaning.edges
            )
        )

    def test_unknown_possessive_relative_preserves_explicit_ownership(self) -> None:
        clause = self.language.analyze(
            "O cão cujo dono acariciou o lobo viu a floresta."
        ).clauses[0]
        self.assertEqual((clause.subject, clause.relation, clause.object), ("cão", "sees", "floresta"))
        self.assertEqual(clause.possessed, "dono")
        self.assertEqual(clause.relative, ())

        meaning = self.semantic.understand(
            "O cão cujo dono acariciou o lobo viu a floresta."
        )
        self.assertTrue(
            any(
                edge.relation == "has"
                and edge.provenance == "possessive:1:cujo"
                for edge in meaning.edges
            )
        )

    def test_possession_is_not_agent_role_of_antecedent(self) -> None:
        clause = self.language.analyze(
            "O cão cujo dono atacou o lobo viu a floresta."
        ).clauses[0]
        relative = clause.relative[0]
        self.assertEqual(relative.subject, "dono")
        self.assertNotEqual(relative.subject, clause.relative_antecedent)

    def test_possessive_metadata_is_serialized(self) -> None:
        meaning = self.semantic.understand(
            "O cão cujo dono atacou o lobo viu a floresta."
        )
        root = meaning.constraints["language"]["clauses"][0]
        self.assertEqual(root["possessive_marker"], "cujo")
        self.assertEqual(root["possessive_antecedent"], "cão")
        self.assertEqual(root["possessed"], "dono")

    def test_complementizer_and_non_possessive_relatives_remain_separate(self) -> None:
        nominal = self.language.analyze(
            "O cão que atacou o lobo viu a floresta."
        ).clauses[0]
        self.assertIsNone(nominal.possessive_marker)

        complement = self.language.analyze(
            "O cão sabe que o lobo atacou a floresta."
        ).clauses[0]
        self.assertIsNone(complement.possessive_marker)

    def test_atomic_quids_are_preserved(self) -> None:
        meaning = self.semantic.understand(
            "O cão cujo dono atacou o lobo viu a floresta."
        )
        self.assertTrue(all(len(node.quid) == 1 for node in meaning.nodes))

    def test_deterministic_possessive_compilation(self) -> None:
        sentence = "O cão cujo dono atacou o lobo viu a floresta."
        snapshots = [
            self.semantic.understand(sentence).to_dict()
            for _ in range(20)
        ]
        self.assertEqual(len({repr(item) for item in snapshots}), 1)

    def test_possessive_relative_inside_coordination_remains_branch_local(self) -> None:
        meaning = self.semantic.understand(
            "O cão cujo dono atacou o lobo viu a floresta e o urso comeu a carne."
        )
        self.assertTrue(any(edge.relation == "has" and edge.provenance == "possessive:1:cujo" for edge in meaning.edges))
        self.assertTrue(any(edge.relation == "sees" for edge in meaning.edges))
        self.assertTrue(any(edge.relation == "eats" for edge in meaning.edges))


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest

from griot_engine import GRIOT
from griot_language import LanguageIntelligence
from griot_semantic_ir import SemanticGRIOT


class H18SubjectRelativeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.language = LanguageIntelligence()
        self.semantic = SemanticGRIOT(self.engine)

    def test_subject_relative_binds_missing_subject(self) -> None:
        clause = self.language.analyze(
            "O lobo que atacou o cão viu a floresta."
        ).clauses[0]
        self.assertEqual((clause.subject, clause.relation, clause.object), ("lobo", "sees", "floresta"))
        self.assertEqual(clause.relativizer, "que")
        self.assertEqual(clause.relative_antecedent, "lobo")
        self.assertEqual(len(clause.relative), 1)
        relative = clause.relative[0]
        self.assertEqual((relative.subject, relative.relation, relative.object), ("lobo", "attacks", "cão"))

    def test_subject_relative_with_explicit_relative_subject_is_not_rebound(self) -> None:
        clause = self.language.analyze(
            "O lobo que o cão atacou viu a floresta."
        ).clauses[0]
        self.assertEqual(clause.relation, "sees")
        self.assertEqual(len(clause.relative), 1)
        relative = clause.relative[0]
        self.assertEqual((relative.subject, relative.relation, relative.object), ("cão", "attacks", "lobo"))

    def test_subject_relative_negation_is_local(self) -> None:
        clause = self.language.analyze(
            "O lobo que não atacou o cão viu a floresta."
        ).clauses[0]
        self.assertFalse(clause.negated)
        self.assertTrue(clause.relative[0].negated)

        meaning = self.semantic.understand(
            "O lobo que não atacou o cão viu a floresta."
        )
        negative = [
            edge for edge in meaning.edges
            if edge.relation == "attacks" and edge.provenance == "relative:1:que"
        ]
        self.assertTrue(negative)
        self.assertTrue(all(edge.negated for edge in negative))

    def test_unknown_subject_relative_does_not_destroy_main_clause(self) -> None:
        clause = self.language.analyze(
            "O lobo que acariciou o cão viu a floresta."
        ).clauses[0]
        self.assertEqual((clause.subject, clause.relation, clause.object), ("lobo", "sees", "floresta"))
        self.assertEqual(len(clause.relative), 0)

    def test_subject_relative_que_is_not_complementizer(self) -> None:
        clause = self.language.analyze(
            "O lobo sabe que o cão atacou a floresta."
        ).clauses[0]
        self.assertEqual(clause.relation, "knows")
        self.assertEqual(len(clause.relative), 0)

    def test_subject_relative_reaches_gir(self) -> None:
        meaning = self.semantic.understand(
            "O lobo que atacou o cão viu a floresta."
        )
        pairs = {(edge.relation, edge.negated) for edge in meaning.edges}
        self.assertIn(("sees", False), pairs)
        self.assertIn(("attacks", False), pairs)
        self.assertTrue(
            any(edge.provenance == "relative:1:que" for edge in meaning.edges)
        )

    def test_subject_relative_metadata_is_serialized(self) -> None:
        meaning = self.semantic.understand(
            "O lobo que atacou o cão viu a floresta."
        )
        root = meaning.constraints["language"]["clauses"][0]
        self.assertEqual(root["relativizer"], "que")
        self.assertEqual(root["relative_antecedent"], "lobo")
        self.assertEqual(root["relative"][0]["relation"], "attacks")

    def test_subject_relative_preserves_atomic_quids(self) -> None:
        meaning = self.semantic.understand(
            "O lobo que atacou o cão viu a floresta."
        )
        self.assertTrue(all(len(node.quid) == 1 for node in meaning.nodes))

    def test_subject_relative_is_deterministic(self) -> None:
        sentence = "O lobo que atacou o cão viu a floresta."
        snapshots = [
            self.semantic.understand(sentence).to_dict()
            for _ in range(20)
        ]
        self.assertEqual(len({repr(item) for item in snapshots}), 1)

    def test_subject_relative_inside_coordinated_branch_remains_local(self) -> None:
        meaning = self.semantic.understand(
            "O lobo que atacou o cão viu a floresta e o urso comeu a carne."
        )
        pairs = {(edge.relation, edge.negated) for edge in meaning.edges}
        self.assertIn(("sees", False), pairs)
        self.assertIn(("attacks", False), pairs)
        self.assertIn(("eats", False), pairs)


if __name__ == "__main__":
    unittest.main()

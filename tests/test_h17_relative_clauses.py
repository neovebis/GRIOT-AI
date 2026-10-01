from __future__ import annotations

import unittest

from griot_engine import GRIOT
from griot_language import LanguageIntelligence
from griot_semantic_ir import SemanticGRIOT


class H17RelativeClauseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.language = LanguageIntelligence()
        self.semantic = SemanticGRIOT(self.engine)

    def test_object_attached_relative_binds_missing_subject(self) -> None:
        clause = self.language.analyze(
            "O lobo viu o cão que atacou a floresta."
        ).clauses[0]
        self.assertEqual((clause.subject, clause.relation, clause.object), ("lobo", "sees", "cão"))
        self.assertEqual(clause.relativizer, "que")
        self.assertEqual(clause.relative_antecedent, "cão")
        self.assertEqual(len(clause.relative), 1)
        relative = clause.relative[0]
        self.assertEqual((relative.subject, relative.relation, relative.object), ("cão", "attacks", "floresta"))

    def test_object_attached_relative_binds_missing_object(self) -> None:
        clause = self.language.analyze(
            "O lobo viu a floresta que o cão atacou."
        ).clauses[0]
        self.assertEqual((clause.subject, clause.relation, clause.object), ("lobo", "sees", "floresta"))
        relative = clause.relative[0]
        self.assertEqual((relative.subject, relative.relation, relative.object), ("cão", "attacks", "floresta"))

    def test_relative_negation_is_local(self) -> None:
        clause = self.language.analyze(
            "O lobo viu o cão que não atacou a floresta."
        ).clauses[0]
        self.assertFalse(clause.negated)
        self.assertTrue(clause.relative[0].negated)

        meaning = self.semantic.understand(
            "O lobo viu o cão que não atacou a floresta."
        )
        negative = [
            edge for edge in meaning.edges
            if edge.relation == "attacks" and edge.provenance == "relative:1:que"
        ]
        self.assertTrue(negative)
        self.assertTrue(all(edge.negated for edge in negative))

    def test_unknown_relative_does_not_destroy_main_clause(self) -> None:
        clause = self.language.analyze(
            "O lobo viu o cão que acariciou a floresta."
        ).clauses[0]
        self.assertEqual((clause.subject, clause.relation, clause.object), ("lobo", "sees", "cão"))
        self.assertEqual(len(clause.relative), 0)

        meaning = self.semantic.understand(
            "O lobo viu o cão que acariciou a floresta."
        )
        relations = {edge.relation for edge in meaning.edges}
        self.assertIn("sees", relations)
        self.assertNotIn("acaricia", relations)

    def test_complementizer_que_is_not_relative(self) -> None:
        clause = self.language.analyze(
            "O lobo sabe que o cão atacou a floresta."
        ).clauses[0]
        self.assertEqual(clause.relation, "knows")
        self.assertEqual(len(clause.relative), 0)
        self.assertEqual(clause.relativizer, None)

    def test_relative_reaches_gir_with_dedicated_provenance(self) -> None:
        meaning = self.semantic.understand(
            "O lobo viu o cão que atacou a floresta."
        )
        pairs = {(edge.relation, edge.negated) for edge in meaning.edges}
        self.assertIn(("sees", False), pairs)
        self.assertIn(("attacks", False), pairs)
        self.assertTrue(
            any(edge.provenance == "relative:1:que" for edge in meaning.edges)
        )

    def test_relative_metadata_is_serialized(self) -> None:
        meaning = self.semantic.understand(
            "O lobo viu o cão que atacou a floresta."
        )
        clauses = meaning.constraints["language"]["clauses"]
        root = clauses[0]
        self.assertEqual(root["relativizer"], "que")
        self.assertEqual(root["relative_antecedent"], "cão")
        self.assertEqual(len(root["relative"]), 1)
        self.assertEqual(root["relative"][0]["relation"], "attacks")

    def test_atomic_quids_survive_relative_compilation(self) -> None:
        meaning = self.semantic.understand(
            "O lobo viu o cão que atacou a floresta."
        )
        self.assertTrue(all(len(node.quid) == 1 for node in meaning.nodes))

    def test_relative_compilation_is_deterministic(self) -> None:
        sentence = "O lobo viu o cão que atacou a floresta."
        snapshots = []
        for _ in range(20):
            meaning = self.semantic.understand(sentence)
            snapshots.append(meaning.to_dict())
        self.assertEqual(len({repr(item) for item in snapshots}), 1)

    def test_relative_under_coordination_remains_branch_local(self) -> None:
        meaning = self.semantic.understand(
            "O lobo viu o cão que atacou a floresta e o urso comeu a carne."
        )
        pairs = {(edge.relation, edge.negated) for edge in meaning.edges}
        self.assertIn(("sees", False), pairs)
        self.assertIn(("attacks", False), pairs)
        self.assertIn(("eats", False), pairs)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest

from griot_engine import GRIOT
from griot_language import LanguageIntelligence
from griot_semantic_ir import SemanticGRIOT


class H23NestedRelativeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.language = LanguageIntelligence()
        self.semantic = SemanticGRIOT(self.engine)

    def test_subject_relative_can_contain_object_relative(self) -> None:
        clause = self.language.analyze(
            "O cão que viu o lobo que atacou a floresta comeu a carne."
        ).clauses[0]
        self.assertEqual(clause.relation, "eats")
        self.assertEqual(len(clause.relative), 1)
        outer = clause.relative[0]
        self.assertEqual((outer.subject, outer.relation, outer.object), ("cão", "sees", "lobo"))
        self.assertEqual(len(outer.relative), 1)
        inner = outer.relative[0]
        self.assertEqual((inner.subject, inner.relation, inner.object), ("lobo", "attacks", "floresta"))

    def test_object_relative_can_contain_nested_relative(self) -> None:
        clause = self.language.analyze(
            "O cão viu o lobo que atacou a floresta que tem árvores."
        ).clauses[0]
        self.assertEqual(clause.relation, "sees")
        self.assertEqual(len(clause.relative), 1)
        outer = clause.relative[0]
        self.assertEqual(outer.relation, "attacks")
        self.assertEqual(len(outer.relative), 1)
        inner = outer.relative[0]
        self.assertEqual((inner.subject, inner.relation, inner.object), ("floresta", "has", "árvores"))

    def test_nested_relative_reaches_gir_at_both_depths(self) -> None:
        meaning = self.semantic.understand(
            "O cão que viu o lobo que atacou a floresta comeu a carne."
        )
        relations = {edge.relation for edge in meaning.edges}
        self.assertTrue({"eats", "sees", "attacks"}.issubset(relations))
        provenances = {
            edge.provenance
            for edge in meaning.edges
            if edge.relation in {"sees", "attacks"}
        }
        self.assertIn("relative:1:que", provenances)
        self.assertIn("relative:2:que.0.0", provenances)

    def test_nested_relative_metadata_is_recursive(self) -> None:
        meaning = self.semantic.understand(
            "O cão que viu o lobo que atacou a floresta comeu a carne."
        )
        root = meaning.constraints["language"]["clauses"][0]
        outer = root["relative"][0]
        inner = outer["relative"][0]
        self.assertEqual(outer["relation"], "sees")
        self.assertEqual(inner["relation"], "attacks")
        self.assertEqual(outer["relative_antecedent"], "cão")
        self.assertEqual(inner["relative_antecedent"], "lobo")

    def test_nested_relative_negation_is_depth_local(self) -> None:
        clause = self.language.analyze(
            "O cão que viu o lobo que não atacou a floresta comeu a carne."
        ).clauses[0]
        self.assertFalse(clause.negated)
        self.assertFalse(clause.relative[0].negated)
        self.assertTrue(clause.relative[0].relative[0].negated)

    def test_unknown_inner_relative_does_not_destroy_outer_relation(self) -> None:
        clause = self.language.analyze(
            "O cão que viu o lobo que acariciou a floresta comeu a carne."
        ).clauses[0]
        self.assertEqual(clause.relation, "eats")
        self.assertEqual(len(clause.relative), 1)
        self.assertEqual(clause.relative[0].relation, "sees")
        self.assertEqual(len(clause.relative[0].relative), 0)

    def test_nested_relative_keeps_atomic_quids(self) -> None:
        meaning = self.semantic.understand(
            "O cão que viu o lobo que atacou a floresta comeu a carne."
        )
        self.assertTrue(all(len(node.quid) == 1 for node in meaning.nodes))

    def test_nested_relative_is_deterministic(self) -> None:
        sentence = "O cão que viu o lobo que atacou a floresta comeu a carne."
        snapshots = [
            self.semantic.understand(sentence).to_dict()
            for _ in range(20)
        ]
        self.assertEqual(len({repr(item) for item in snapshots}), 1)

    def test_nested_relative_under_coordination_remains_branch_local(self) -> None:
        clause = self.language.analyze(
            "O cão que viu o lobo que atacou a floresta comeu a carne e o urso viu o cão."
        ).clauses[0]
        self.assertEqual(clause.relation, "eats")
        self.assertEqual(clause.coordinator, "e")
        self.assertEqual(len(clause.relative), 1)
        self.assertEqual(len(clause.relative[0].relative), 1)
        self.assertEqual(clause.coordinated[0].relation, "sees")

    def test_nested_relative_with_possessive_inner_clause_preserves_h21(self) -> None:
        clause = self.language.analyze(
            "O cão que viu o lobo cujo dono atacou a floresta comeu a carne."
        ).clauses[0]
        self.assertEqual(clause.relation, "eats")
        self.assertEqual(len(clause.relative), 1)
        inner_target = clause.relative[0].relative[0]
        self.assertEqual(inner_target.possessive_marker, "cujo")
        self.assertEqual(inner_target.possessed, "dono")


if __name__ == "__main__":
    unittest.main()

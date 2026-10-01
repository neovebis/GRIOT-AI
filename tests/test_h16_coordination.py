from __future__ import annotations

import unittest

from griot_engine import GRIOT
from griot_language import LanguageIntelligence
from griot_semantic_ir import SemanticGRIOT


class H16CoordinationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.language = LanguageIntelligence()
        self.semantic = SemanticGRIOT(self.engine)

    def test_and_creates_sibling_clause(self) -> None:
        analysis = self.language.analyze(
            "O lobo atacou o cão e o cão viu a floresta."
        )
        root = analysis.clauses[0]
        self.assertEqual(root.coordinator, "e")
        self.assertEqual((root.subject, root.relation, root.object), ("lobo", "attacks", "cão"))
        self.assertEqual(len(root.coordinated), 1)
        sibling = root.coordinated[0]
        self.assertEqual((sibling.subject, sibling.relation, sibling.object), ("cão", "sees", "floresta"))

    def test_or_is_preserved_without_collapsing_semantics(self) -> None:
        clause = self.language.analyze(
            "O lobo atacou o cão ou o lobo viu a floresta."
        ).clauses[0]
        self.assertEqual(clause.coordinator, "ou")
        self.assertEqual(clause.coordinated[0].relation, "sees")

    def test_sibling_relations_reach_gir(self) -> None:
        meaning = self.semantic.understand(
            "O lobo atacou o cão e o cão viu a floresta."
        )
        pairs = {(edge.relation, edge.negated) for edge in meaning.edges}
        self.assertIn(("attacks", False), pairs)
        self.assertIn(("sees", False), pairs)

    def test_coordinate_provenance_is_distinct_from_embedding(self) -> None:
        meaning = self.semantic.understand(
            "O lobo atacou o cão e o cão viu a floresta."
        )
        coordination = tuple(meaning.constraints["coordination"])
        self.assertEqual(len(coordination), 1)
        self.assertEqual(coordination[0]["coordinator"], "e")
        self.assertEqual(coordination[0]["depth"], 1)
        self.assertIn("coordinated:1:e", {
            edge.provenance for edge in meaning.edges if edge.relation == "sees"
        })

    def test_sibling_negation_is_preserved(self) -> None:
        clause = self.language.analyze(
            "O lobo atacou o cão e o cão não viu a floresta."
        ).clauses[0]
        self.assertTrue(clause.coordinated[0].negated)
        meaning = self.semantic.understand(
            "O lobo atacou o cão e o cão não viu a floresta."
        )
        negative = [
            edge for edge in meaning.edges
            if edge.relation == "sees" and edge.provenance == "coordinated:1:e"
        ]
        self.assertTrue(negative)
        self.assertTrue(all(edge.negated for edge in negative))

    def test_unknown_sibling_abstains_without_destroying_root(self) -> None:
        analysis = self.language.analyze(
            "O lobo atacou o cão e o cão acariciou a floresta."
        )
        root = analysis.clauses[0]
        self.assertEqual(root.relation, "attacks")
        self.assertIsNone(root.coordinated[0].relation)
        meaning = self.semantic.understand(
            "O lobo atacou o cão e o cão acariciou a floresta."
        )
        relations = {edge.relation for edge in meaning.edges}
        self.assertIn("attacks", relations)
        self.assertNotIn("acaricia", relations)

    def test_coordination_with_nested_embedding_preserves_both_branches(self) -> None:
        analysis = self.language.analyze(
            "O lobo atacou o cão e o cão viu a floresta porque o lobo fugiu."
        )
        root = analysis.clauses[0]
        self.assertEqual(root.coordinator, "e")
        sibling = root.coordinated[0]
        self.assertEqual(sibling.relation, "sees")
        self.assertEqual(sibling.subordinator, "porque")
        self.assertEqual(len(sibling.embedded), 1)

        meaning = self.semantic.understand(
            "O lobo atacou o cão e o cão viu a floresta porque o lobo atacou o cão."
        )
        pairs = {(edge.relation, edge.negated) for edge in meaning.edges}
        self.assertIn(("attacks", False), pairs)
        self.assertIn(("sees", False), pairs)
        self.assertGreaterEqual(list(pairs).count(("attacks", False)), 1)

    def test_atomic_quid_invariant_under_coordination(self) -> None:
        meaning = self.semantic.understand(
            "O lobo atacou o cão e o cão viu a floresta."
        )
        self.assertTrue(all(len(node.quid) == 1 for node in meaning.nodes))

    def test_coordination_is_deterministic(self) -> None:
        sentence = "O lobo atacou o cão e o cão viu a floresta."
        snapshots = []
        for _ in range(20):
            analysis = self.language.analyze(sentence)
            root = analysis.clauses[0]
            snapshots.append((
                root.coordinator,
                (root.subject, root.relation, root.object),
                tuple(
                    (x.subject, x.relation, x.object, x.negated)
                    for x in root.coordinated
                ),
            ))
        self.assertEqual(len(set(snapshots)), 1)

    def test_h15_embedding_remains_separate_from_coordination(self) -> None:
        clause = self.language.analyze(
            "O lobo atacou o cão porque o cão viu a floresta."
        ).clauses[0]
        self.assertEqual(clause.subordinator, "porque")
        self.assertEqual(len(clause.embedded), 1)
        self.assertEqual(len(clause.coordinated), 0)


if __name__ == "__main__":
    unittest.main()

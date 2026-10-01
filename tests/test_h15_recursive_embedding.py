from __future__ import annotations

import unittest

from griot_engine import GRIOT
from griot_language import LanguageIntelligence
from griot_semantic_ir import SemanticGRIOT


class H15RecursiveEmbeddingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.language = LanguageIntelligence()
        self.semantic = SemanticGRIOT(self.engine)

    def test_recursive_language_tree_has_two_embedding_levels(self) -> None:
        analysis = self.language.analyze(
            "O lobo atacou o cão porque o cão viu a floresta quando o lobo atacou o cão."
        )
        root = analysis.clauses[0]
        self.assertEqual((root.subject, root.relation, root.object), ("lobo", "attacks", "cão"))
        self.assertEqual(root.subordinator, "porque")
        self.assertEqual(len(root.embedded), 1)

        level_one = root.embedded[0]
        self.assertEqual((level_one.subject, level_one.relation, level_one.object), ("cão", "sees", "floresta"))
        self.assertEqual(level_one.subordinator, "quando")
        self.assertEqual(len(level_one.embedded), 1)

        level_two = level_one.embedded[0]
        self.assertEqual((level_two.subject, level_two.relation, level_two.object), ("lobo", "attacks", "cão"))
        self.assertEqual(len(level_two.embedded), 0)

    def test_recursive_compilation_preserves_all_recognized_relations(self) -> None:
        meaning = self.semantic.understand(
            "O lobo atacou o cão porque o cão viu a floresta quando o lobo atacou o cão."
        )
        relations = [edge.relation for edge in meaning.edges]
        self.assertGreaterEqual(relations.count("attacks"), 2)
        self.assertGreaterEqual(relations.count("sees"), 1)

    def test_nested_provenance_records_the_embedding_path(self) -> None:
        meaning = self.semantic.understand(
            "O lobo atacou o cão porque o cão viu a floresta quando o lobo atacou o cão."
        )
        records = tuple(meaning.constraints["embedding"])
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["depth"], 1)
        self.assertEqual(records[0]["subordinators"], ("porque",))
        self.assertEqual(records[1]["depth"], 2)
        self.assertEqual(records[1]["subordinators"], ("porque", "quando"))

        nested_edges = [
            edge
            for edge in meaning.edges
            if edge.provenance == "embedded:2:porque>quando"
        ]
        self.assertTrue(nested_edges)
        self.assertTrue(all(edge.evidence == "o lobo atacou o cão" for edge in nested_edges))

    def test_unknown_innermost_predicate_abstains_without_destroying_middle_clause(self) -> None:
        sentence = (
            "O lobo atacou o cão porque o cão viu a floresta "
            "quando o lobo acariciou o cão."
        )
        analysis = self.language.analyze(sentence)
        root = analysis.clauses[0]
        middle = root.embedded[0]
        inner = middle.embedded[0]

        self.assertEqual(middle.relation, "sees")
        self.assertIsNone(inner.relation)
        self.assertEqual(
            (root.subject, root.relation, root.object),
            ("lobo", "attacks", "cão"),
        )

        meaning = self.semantic.understand(sentence)
        semantic_pairs = {
            (edge.relation, edge.negated)
            for edge in meaning.edges
        }
        self.assertIn(("attacks", False), semantic_pairs)
        self.assertIn(("sees", False), semantic_pairs)
        self.assertNotIn(("acaricia", False), semantic_pairs)

    def test_nested_negation_is_preserved(self) -> None:
        clause = self.language.analyze(
            "O lobo atacou o cão porque o cão viu a floresta "
            "quando o lobo não atacou o cão."
        ).clauses[0]
        self.assertTrue(clause.embedded[0].embedded[0].negated)

        meaning = self.semantic.understand(
            "O lobo atacou o cão porque o cão viu a floresta "
            "quando o lobo não atacou o cão."
        )
        nested_negative = [
            edge
            for edge in meaning.edges
            if edge.provenance == "embedded:2:porque>quando"
            and edge.relation == "attacks"
        ]
        self.assertTrue(nested_negative)
        self.assertTrue(all(edge.negated for edge in nested_negative))

    def test_recursive_compilation_keeps_quids_atomic(self) -> None:
        meaning = self.semantic.understand(
            "O lobo atacou o cão porque o cão viu a floresta quando o lobo atacou o cão."
        )
        self.assertTrue(all(len(node.quid) == 1 for node in meaning.nodes))

    def test_recursive_compilation_is_deterministic(self) -> None:
        sentence = (
            "O lobo atacou o cão porque o cão viu a floresta "
            "quando o lobo atacou o cão."
        )
        snapshots = []
        for _ in range(20):
            meaning = self.semantic.understand(sentence)
            snapshots.append(meaning.to_dict())
        self.assertEqual(len({repr(item) for item in snapshots}), 1)

    def test_single_level_h14_behavior_remains_unchanged(self) -> None:
        clause = self.language.analyze(
            "O lobo atacou o cão porque o cão viu a floresta."
        ).clauses[0]
        self.assertEqual(clause.subordinator, "porque")
        self.assertEqual(clause.embedded[0].relation, "sees")
        self.assertEqual(len(clause.embedded[0].embedded), 0)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest

from griot_engine import GRIOT
from griot_language import LanguageIntelligence
from griot_semantic_ir import SemanticGRIOT


class H14EmbeddedClauseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.language = LanguageIntelligence()
        self.semantic = SemanticGRIOT(self.engine)

    def test_because_creates_embedded_clause(self) -> None:
        analysis = self.language.analyze(
            "O lobo atacou o cão porque o cão invadiu a floresta."
        )
        self.assertEqual(len(analysis.clauses), 1)
        clause = analysis.clauses[0]
        self.assertEqual(
            (clause.subject, clause.relation, clause.object),
            ("lobo", "attacks", "cão"),
        )
        self.assertEqual(clause.subordinator, "porque")
        self.assertEqual(len(clause.embedded), 1)
        self.assertEqual(
            (
                clause.embedded[0].subject,
                clause.embedded[0].relation,
                clause.embedded[0].object,
            ),
            ("cão", "sees", "floresta"),
        )

    def test_embedded_predicate_is_composed_independently(self) -> None:
        analysis = self.language.analyze(
            "O lobo atacou o cão porque o cão atacou o lobo."
        )
        embedded = analysis.clauses[0].embedded[0]
        self.assertEqual(
            (embedded.subject, embedded.relation, embedded.object),
            ("cão", "attacks", "lobo"),
        )

    def test_when_clause_is_embedded(self) -> None:
        clause = self.language.analyze(
            "O lobo atacou o cão quando o cão viu a floresta."
        ).clauses[0]
        self.assertEqual(clause.subordinator, "quando")
        self.assertEqual(len(clause.embedded), 1)
        self.assertEqual(clause.embedded[0].relation, "sees")

    def test_embedded_negation_is_preserved(self) -> None:
        clause = self.language.analyze(
            "O lobo atacou o cão porque o cão não atacou o lobo."
        ).clauses[0]
        self.assertTrue(clause.embedded[0].negated)

    def test_unknown_embedded_predicate_abstains_without_breaking_main_clause(self) -> None:
        clause = self.language.analyze(
            "O lobo atacou o cão porque o cão acariciou o lobo."
        ).clauses[0]
        self.assertEqual((clause.subject, clause.relation, clause.object), ("lobo", "attacks", "cão"))
        self.assertIsNone(clause.embedded[0].relation)

    def test_embedded_clause_reaches_gir(self) -> None:
        meaning = self.semantic.understand(
            "O lobo atacou o cão porque o cão atacou o lobo."
        )
        relations = {(edge.relation, edge.negated) for edge in meaning.edges}
        self.assertIn(("attacks", False), relations)
        attack_edges = [edge for edge in meaning.edges if edge.relation == "attacks"]
        self.assertGreaterEqual(len(attack_edges), 2)
        self.assertTrue(all(len(node.quid) == 1 for node in meaning.nodes))

    def test_nested_clause_compilation_is_deterministic(self) -> None:
        sentence = "O lobo atacou o cão porque o cão viu a floresta."
        snapshots = []
        for _ in range(20):
            analysis = self.language.analyze(sentence)
            clause = analysis.clauses[0]
            snapshots.append(
                (
                    clause.subject,
                    clause.relation,
                    clause.object,
                    clause.subordinator,
                    tuple(
                        (
                            embedded.subject,
                            embedded.relation,
                            embedded.object,
                            embedded.negated,
                        )
                        for embedded in clause.embedded
                    ),
                )
            )
        self.assertEqual(len(set(snapshots)), 1)

    def test_unknown_subordinator_does_not_create_false_embedding(self) -> None:
        clause = self.language.analyze(
            "O lobo vê o porque secreto."
        ).clauses[0]
        self.assertEqual(len(clause.embedded), 0)


if __name__ == "__main__":
    unittest.main()

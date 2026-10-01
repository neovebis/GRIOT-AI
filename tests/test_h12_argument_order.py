from __future__ import annotations

import unittest

from griot_engine import GRIOT
from griot_language import LanguageIntelligence
from griot_reasoning_v040 import ReasoningEngine, TruthStatus
from griot_semantic_ir import SemanticGRIOT


class H12ArgumentOrderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.language = LanguageIntelligence()
        self.semantic = SemanticGRIOT(self.engine)
        self.reasoning = ReasoningEngine(self.semantic)

    @staticmethod
    def _relation_shape(meaning):
        return {
            (edge.source, edge.relation, edge.target, edge.negated)
            for edge in meaning.edges
            if edge.relation == "attacks"
        }

    def test_object_topicalization_maps_to_same_semantics(self) -> None:
        active = self.language.analyze("O lobo atacou o cão.").clauses[0]
        fronted = self.language.analyze("O cão, o lobo atacou.").clauses[0]
        self.assertEqual(
            (active.subject, active.relation, active.object),
            (fronted.subject, fronted.relation, fronted.object),
        )

    def test_prepositional_topicalization_preserves_governed_argument(self) -> None:
        clause = self.language.analyze("De água, o lobo precisa.").clauses[0]
        self.assertEqual(
            (clause.subject, clause.relation, clause.object),
            ("lobo", "needs", "água"),
        )

    def test_a_preposition_is_normalized_in_fronted_argument(self) -> None:
        clause = self.language.analyze("Ao cão, o lobo atacou.").clauses[0]
        self.assertEqual(
            (clause.subject, clause.relation, clause.object),
            ("lobo", "attacks", "cão"),
        )

    def test_fronted_argument_reaches_gir(self) -> None:
        meaning = self.semantic.understand("O cão, o lobo atacou.")
        self.assertTrue(self._relation_shape(meaning))
        self.assertTrue(all(len(node.quid) == 1 for node in meaning.nodes))

    def test_fronted_and_canonical_forms_have_same_relation_shape(self) -> None:
        active = self.semantic.understand("O lobo ataca o cão.")
        fronted = self.semantic.understand("O cão, o lobo ataca.")
        self.assertEqual(
            {(e.relation, e.negated) for e in active.edges if e.relation == "attacks"},
            {(e.relation, e.negated) for e in fronted.edges if e.relation == "attacks"},
        )

    def test_fronted_learning_supports_canonical_query(self) -> None:
        self.semantic.learn("O cão, o lobo atacou.", "h12")
        result = self.reasoning.reason("O lobo ataca o cão?")
        self.assertEqual(result.status, TruthStatus.SUPPORTED)

    def test_canonical_learning_supports_fronted_query(self) -> None:
        self.semantic.learn("O lobo ataca o cão.", "h12")
        result = self.reasoning.reason("O cão, o lobo ataca?")
        self.assertEqual(result.status, TruthStatus.SUPPORTED)

    def test_temporal_fronting_is_not_reinterpreted_as_argument_fronting(self) -> None:
        clause = self.language.analyze("Ontem, o lobo atacou o cão.").clauses[0]
        self.assertEqual(
            (clause.subject, clause.relation, clause.object),
            ("lobo", "attacks", "cão"),
        )
        self.assertIn("past", clause.temporal)

    def test_unknown_fronted_argument_does_not_invent_relation(self) -> None:
        clause = self.language.analyze("Do mistério, o lobo desconhecido fala.").clauses[0]
        self.assertIsNone(clause.relation)

    def test_argument_fronting_is_deterministic(self) -> None:
        sentence = "Ao cão, o lobo atacou."
        snapshots = []
        for _ in range(20):
            clause = self.language.analyze(sentence).clauses[0]
            snapshots.append(
                (
                    clause.subject,
                    clause.relation,
                    clause.object,
                    tuple((role.role, role.text) for role in clause.roles),
                )
            )
        self.assertEqual(len(set(snapshots)), 1)


if __name__ == "__main__":
    unittest.main()

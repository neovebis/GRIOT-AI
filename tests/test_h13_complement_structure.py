from __future__ import annotations

import unittest

from griot_engine import GRIOT
from griot_language import LanguageIntelligence
from griot_reasoning_v040 import ReasoningEngine, TruthStatus
from griot_semantic_ir import SemanticGRIOT


class H13ComplementStructureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.language = LanguageIntelligence()
        self.semantic = SemanticGRIOT(self.engine)
        self.reasoning = ReasoningEngine(self.semantic)

    @staticmethod
    def _give_relation_shape(meaning):
        return {
            (edge.source, edge.relation, edge.target, edge.negated)
            for edge in meaning.edges
            if edge.relation == "gives"
        }

    def test_needs_complement_strips_governed_preposition(self) -> None:
        clause = self.language.analyze("O lobo precisa de água.").clauses[0]
        self.assertEqual(
            (clause.subject, clause.relation, clause.object),
            ("lobo", "needs", "água"),
        )

    def test_locative_complement_strips_governed_preposition(self) -> None:
        clause = self.language.analyze("O lobo vive na floresta.").clauses[0]
        self.assertEqual(
            (clause.subject, clause.relation, clause.object),
            ("lobo", "located_in", "floresta"),
        )

    def test_give_direct_then_recipient(self) -> None:
        clause = self.language.analyze("O lobo deu o osso ao cão.").clauses[0]
        roles = {role.role: role.text for role in clause.roles}
        self.assertEqual(
            (clause.subject, clause.relation, clause.object),
            ("lobo", "gives", "osso"),
        )
        self.assertEqual(roles["recipient"], "cão")

    def test_give_recipient_then_direct(self) -> None:
        clause = self.language.analyze("O lobo deu ao cão o osso.").clauses[0]
        roles = {role.role: role.text for role in clause.roles}
        self.assertEqual(
            (clause.subject, clause.relation, clause.object),
            ("lobo", "gives", "osso"),
        )
        self.assertEqual(roles["recipient"], "cão")

    def test_give_para_variant(self) -> None:
        clause = self.language.analyze("O lobo deu o osso para o cão.").clauses[0]
        roles = {role.role: role.text for role in clause.roles}
        self.assertEqual(
            (clause.subject, clause.relation, clause.object),
            ("lobo", "gives", "osso"),
        )
        self.assertEqual(roles["recipient"], "cão")

    def test_fronted_recipient_preserves_direct_object(self) -> None:
        clause = self.language.analyze("Ao cão, o lobo deu o osso.").clauses[0]
        roles = {role.role: role.text for role in clause.roles}
        self.assertEqual(
            (clause.subject, clause.relation, clause.object),
            ("lobo", "gives", "osso"),
        )
        self.assertEqual(roles["recipient"], "cão")

    def test_fronted_recipient_reaches_gir(self) -> None:
        meaning = self.semantic.understand("Ao cão, o lobo deu o osso.")
        self.assertTrue(self._give_relation_shape(meaning))
        self.assertTrue(all(len(node.quid) == 1 for node in meaning.nodes))

    def test_give_variants_have_same_relation_shape(self) -> None:
        forms = (
            "O lobo deu o osso ao cão.",
            "O lobo deu ao cão o osso.",
            "O lobo deu o osso para o cão.",
            "Ao cão, o lobo deu o osso.",
        )
        shapes = [self._give_relation_shape(self.semantic.understand(form)) for form in forms]
        self.assertTrue(all(shapes))
        self.assertEqual(len({frozenset(shape) for shape in shapes}), 1)

    def test_learning_supports_query_across_complement_order(self) -> None:
        self.semantic.learn("O lobo deu ao cão o osso.", "h13")
        result = self.reasoning.reason("O lobo deu o osso ao cão?")
        self.assertEqual(result.status, TruthStatus.SUPPORTED)

    def test_query_supports_fronted_recipient_form(self) -> None:
        self.semantic.learn("O lobo deu o osso ao cão.", "h13")
        result = self.reasoning.reason("Ao cão, o lobo deu o osso?")
        self.assertEqual(result.status, TruthStatus.SUPPORTED)

    def test_complement_roles_are_deterministic(self) -> None:
        sentence = "O lobo deu ao cão o osso."
        snapshots = []
        for _ in range(20):
            clause = self.language.analyze(sentence).clauses[0]
            snapshots.append(
                (
                    clause.subject,
                    clause.relation,
                    clause.object,
                    tuple(sorted((role.role, role.text) for role in clause.roles)),
                )
            )
        self.assertEqual(len(set(snapshots)), 1)

    def test_unknown_relation_does_not_invent_complement_semantics(self) -> None:
        clause = self.language.analyze("O lobo acariciou o cão.").clauses[0]
        self.assertIsNone(clause.relation)

    def test_fronted_recipient_is_not_split_into_multiple_clauses(self) -> None:
        clauses = self.language.analyze("Ao cão, o lobo deu o osso.").clauses
        self.assertEqual(len(clauses), 1)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest

from griot_engine import GRIOT
from griot_language import LanguageIntelligence
from griot_reasoning_v040 import ReasoningEngine, TruthStatus
from griot_semantic_grammar import SemanticGrammar
from griot_semantic_ir import SemanticGRIOT


class H11StructuralParaphraseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.language = LanguageIntelligence()
        self.semantic = SemanticGRIOT(self.engine)
        self.grammar = SemanticGrammar(self.engine)
        self.reasoning = ReasoningEngine(self.semantic)

    def test_passive_voice_maps_to_active_semantics(self) -> None:
        clause = self.language.analyze("O cão foi atacado pelo lobo.").clauses[0]
        self.assertEqual(clause.subject, "lobo")
        self.assertEqual(clause.relation, "attacks")
        self.assertEqual(clause.object, "cão")

    def test_passive_present_maps_to_active_semantics(self) -> None:
        clause = self.language.analyze("O cão é atacado pelo lobo.").clauses[0]
        self.assertEqual((clause.subject, clause.relation, clause.object), ("lobo", "attacks", "cão"))

    def test_passive_roles_are_reversed_correctly(self) -> None:
        clause = self.language.analyze("O cão foi atacado pelo lobo.").clauses[0]
        roles = {role.role: role.text for role in clause.roles}
        self.assertEqual(roles["agent"], "lobo")
        self.assertEqual(roles["patient"], "cão")

    def test_nominalized_attack_maps_to_relation(self) -> None:
        clause = self.language.analyze("O ataque do lobo ao cão.").clauses[0]
        self.assertEqual((clause.subject, clause.relation, clause.object), ("lobo", "attacks", "cão"))

    def test_nominalized_construction_maps_from_por_agent(self) -> None:
        clause = self.language.analyze("A construção da casa pelo arquiteto.").clauses[0]
        self.assertEqual((clause.subject, clause.relation, clause.object), ("arquiteto", "builds", "casa"))

    def test_fronted_temporal_adverb_does_not_change_semantics(self) -> None:
        active = self.language.analyze("O lobo atacou o cão.").clauses[0]
        fronted = self.language.analyze("Ontem, o lobo atacou o cão.").clauses[0]
        self.assertEqual(
            (active.subject, active.relation, active.object),
            (fronted.subject, fronted.relation, fronted.object),
        )

    def test_passive_reaches_gir(self) -> None:
        meaning = self.semantic.understand("O cão foi atacado pelo lobo.")
        self.assertTrue(any(edge.relation == "attacks" for edge in meaning.edges))
        self.assertTrue(all(len(node.quid) == 1 for node in meaning.nodes))

    def test_passive_and_active_produce_same_relation_shape(self) -> None:
        active = self.semantic.understand("O lobo ataca o cão.")
        passive = self.semantic.understand("O cão foi atacado pelo lobo.")
        active_relations = {(e.relation, e.negated) for e in active.edges if e.relation == "attacks"}
        passive_relations = {(e.relation, e.negated) for e in passive.edges if e.relation == "attacks"}
        self.assertEqual(active_relations, passive_relations)

    def test_passive_learning_supports_active_query(self) -> None:
        self.semantic.learn("O cão foi atacado pelo lobo.", "h11")
        result = self.reasoning.reason("O lobo ataca o cão?")
        self.assertEqual(result.status, TruthStatus.SUPPORTED)

    def test_active_learning_supports_passive_query(self) -> None:
        self.semantic.learn("O lobo ataca o cão.", "h11")
        result = self.reasoning.reason("O cão foi atacado pelo lobo?")
        self.assertEqual(result.status, TruthStatus.SUPPORTED)

    def test_unknown_passive_participle_abstains(self) -> None:
        clause = self.language.analyze("O cão foi acariciado pelo lobo.").clauses[0]
        self.assertIsNone(clause.relation)

    def test_governance_not_corrupted_by_fronting(self) -> None:
        analysis = self.grammar.analyze("Ontem, o lobo precisa de água.")
        self.assertTrue(analysis.frames)
        self.assertEqual(analysis.frames[0].relation, "needs")

    def test_structural_parsing_is_deterministic(self) -> None:
        sentence = "O cão foi atacado pelo lobo."
        snapshots = []
        for _ in range(20):
            clause = self.language.analyze(sentence).clauses[0]
            snapshots.append((clause.subject, clause.relation, clause.object, tuple((r.role, r.text) for r in clause.roles)))
        self.assertEqual(len(set(snapshots)), 1)


if __name__ == "__main__":
    unittest.main()

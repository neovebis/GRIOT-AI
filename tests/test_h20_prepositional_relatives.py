from __future__ import annotations

import unittest

from griot_engine import GRIOT
from griot_language import LanguageIntelligence
from griot_semantic_ir import SemanticGRIOT


class H20PrepositionalRelativeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.language = LanguageIntelligence()
        self.semantic = SemanticGRIOT(self.engine)

    def test_em_que_preserves_locative_preposition(self) -> None:
        clause = self.language.analyze(
            "A floresta em que o lobo está tem árvores."
        ).clauses[0]
        self.assertEqual(clause.relativizer, "em que")
        self.assertEqual(clause.relativizer_kind, "locative")
        self.assertEqual(clause.relative_preposition, "em")
        self.assertEqual(clause.relative_binding, "object")
        self.assertEqual(clause.relative[0].relation, "located_in")
        self.assertEqual(clause.relative[0].object, "floresta")

    def test_na_qual_normalizes_to_em_without_collapsing_surface_form(self) -> None:
        clause = self.language.analyze(
            "A floresta na qual o lobo está tem árvores."
        ).clauses[0]
        self.assertEqual(clause.relativizer, "na qual")
        self.assertEqual(clause.relativizer_kind, "locative")
        self.assertEqual(clause.relative_preposition, "em")
        self.assertEqual(clause.relative[0].relation, "located_in")

    def test_no_qual_preserves_preposition_as_em(self) -> None:
        clause = self.language.analyze(
            "O local no qual o lobo está tem árvores."
        ).clauses[0]
        self.assertEqual(clause.relativizer, "no qual")
        self.assertEqual(clause.relative_preposition, "em")
        self.assertEqual(clause.relative[0].relation, "located_in")

    def test_a_quem_preserves_personal_preposition(self) -> None:
        clause = self.language.analyze(
            "O cão viu a pessoa a quem o lobo ajuda."
        ).clauses[0]
        self.assertEqual(clause.relativizer, "a quem")
        self.assertEqual(clause.relativizer_kind, "personal")
        self.assertEqual(clause.relative_preposition, "a")
        self.assertEqual(clause.relative_binding, "object")
        self.assertEqual(
            (clause.relative[0].subject, clause.relative[0].relation, clause.relative[0].object),
            ("lobo", "helps", "pessoa"),
        )

    def test_de_que_is_prepositional_not_plain_nominal(self) -> None:
        clause = self.language.analyze(
            "O projeto de que o lobo precisa venceu."
        ).clauses[0]
        self.assertEqual(clause.relativizer, "de que")
        self.assertEqual(clause.relativizer_kind, "prepositional")
        self.assertEqual(clause.relative_preposition, "de")
        self.assertEqual(clause.relative_binding, "object")
        self.assertEqual(clause.relative[0].relation, "needs")

    def test_plain_a_qual_has_no_preposition(self) -> None:
        clause = self.language.analyze(
            "O lobo viu a floresta, a qual o cão atacou."
        ).clauses[0]
        self.assertEqual(clause.relativizer, "a qual")
        self.assertEqual(clause.relativizer_kind, "nominal")
        self.assertIsNone(clause.relative_preposition)

    def test_unknown_prepositional_relative_keeps_main_clause(self) -> None:
        clause = self.language.analyze(
            "A pessoa a quem o lobo acariciou viu a floresta."
        ).clauses[0]
        self.assertEqual((clause.subject, clause.relation, clause.object), ("pessoa", "sees", "floresta"))
        self.assertEqual(clause.relativizer, "a quem")
        self.assertEqual(clause.relativizer_kind, "personal")
        self.assertEqual(clause.relative_binding, "unknown")
        self.assertIsNone(clause.relative[0].relation if clause.relative else None)

    def test_preposition_reaches_gir_metadata(self) -> None:
        meaning = self.semantic.understand(
            "A floresta em que o lobo está tem árvores."
        )
        root = meaning.constraints["language"]["clauses"][0]
        self.assertEqual(root["relativizer"], "em que")
        self.assertEqual(root["relative_preposition"], "em")
        self.assertEqual(root["relative"][0]["relation"], "located_in")

    def test_prepositional_relative_provenance_preserves_surface_marker(self) -> None:
        meaning = self.semantic.understand(
            "O cão viu a pessoa a quem o lobo ajuda."
        )
        self.assertTrue(
            any(edge.provenance == "relative:1:a quem" for edge in meaning.edges)
        )

    def test_atomic_quids_and_determinism_are_preserved(self) -> None:
        sentence = "A floresta em que o lobo está tem árvores."
        snapshots = []
        for _ in range(20):
            meaning = self.semantic.understand(sentence)
            snapshots.append(meaning.to_dict())
            self.assertTrue(all(len(node.quid) == 1 for node in meaning.nodes))
        self.assertEqual(len({repr(item) for item in snapshots}), 1)

    def test_h19_nominal_relative_behavior_remains_unchanged(self) -> None:
        clause = self.language.analyze(
            "O lobo viu o cão, o qual atacou a floresta."
        ).clauses[0]
        self.assertEqual(clause.relativizer_kind, "nominal")
        self.assertIsNone(clause.relative_preposition)


if __name__ == "__main__":
    unittest.main()

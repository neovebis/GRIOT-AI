from __future__ import annotations

import unittest

from griot_engine import GRIOT
from griot_language import LanguageIntelligence
from griot_semantic_ir import SemanticGRIOT


class H19RelativePronounTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.language = LanguageIntelligence()
        self.semantic = SemanticGRIOT(self.engine)

    def test_o_qual_is_normalized_as_nominal_object_binding(self) -> None:
        clause = self.language.analyze(
            "O lobo viu o cão, o qual atacou a floresta."
        ).clauses[0]
        self.assertEqual(clause.relativizer, "o qual")
        self.assertEqual(clause.relativizer_kind, "nominal")
        self.assertEqual(clause.relative_binding, "subject")
        self.assertEqual(clause.relative_antecedent, "cão")
        self.assertEqual(
            (clause.relative[0].subject, clause.relative[0].relation, clause.relative[0].object),
            ("cão", "attacks", "floresta"),
        )

    def test_a_qual_is_normalized_and_binds_missing_object(self) -> None:
        clause = self.language.analyze(
            "O lobo viu a floresta, a qual o cão atacou."
        ).clauses[0]
        self.assertEqual(clause.relativizer, "a qual")
        self.assertEqual(clause.relativizer_kind, "nominal")
        self.assertEqual(clause.relative_binding, "object")
        self.assertEqual(clause.relative_antecedent, "floresta")
        self.assertEqual(
            (clause.relative[0].subject, clause.relative[0].relation, clause.relative[0].object),
            ("cão", "attacks", "floresta"),
        )

    def test_plural_relative_form_is_preserved(self) -> None:
        clause = self.language.analyze(
            "O lobo viu os cães, os quais atacaram a floresta."
        ).clauses[0]
        self.assertEqual(clause.relativizer, "os quais")
        self.assertEqual(clause.relativizer_kind, "nominal")
        self.assertEqual(clause.relative_binding, "subject")
        self.assertEqual(clause.relative_antecedent, "cães")

    def test_locative_relative_is_classified(self) -> None:
        clause = self.language.analyze(
            "A floresta onde o lobo está tem árvores."
        ).clauses[0]
        self.assertEqual(clause.relativizer, "onde")
        self.assertEqual(clause.relativizer_kind, "locative")
        self.assertEqual(clause.relative_binding, "object")
        self.assertEqual(clause.relative_antecedent, "floresta")
        self.assertEqual(clause.relative[0].relation, "located_in")
        self.assertEqual(clause.relative[0].object, "floresta")

    def test_que_retains_nominal_kind_for_subject_relative(self) -> None:
        clause = self.language.analyze(
            "O lobo que atacou o cão viu a floresta."
        ).clauses[0]
        self.assertEqual(clause.relativizer_kind, "nominal")
        self.assertEqual(clause.relative_binding, "subject")

    def test_unknown_relative_keeps_binding_metadata_but_no_relation(self) -> None:
        clause = self.language.analyze(
            "O lobo que acariciou o cão viu a floresta."
        ).clauses[0]
        self.assertEqual(clause.relativizer, "que")
        self.assertEqual(clause.relativizer_kind, "nominal")
        self.assertEqual(clause.relative_binding, "unknown")
        self.assertEqual(clause.relative_antecedent, "lobo")
        self.assertEqual(clause.relation, "sees")

    def test_complementizer_que_has_no_relative_metadata(self) -> None:
        clause = self.language.analyze(
            "O lobo sabe que o cão atacou a floresta."
        ).clauses[0]
        self.assertIsNone(clause.relativizer)
        self.assertIsNone(clause.relativizer_kind)
        self.assertIsNone(clause.relative_binding)

    def test_relative_pronoun_provenance_reaches_gir(self) -> None:
        meaning = self.semantic.understand(
            "O lobo viu o cão, o qual atacou a floresta."
        )
        self.assertTrue(
            any(edge.provenance == "relative:1:o qual" for edge in meaning.edges)
        )

    def test_relative_language_metadata_is_serialized(self) -> None:
        meaning = self.semantic.understand(
            "A floresta onde o lobo está tem árvores."
        )
        root = meaning.constraints["language"]["clauses"][0]
        self.assertEqual(root["relativizer"], "onde")
        self.assertEqual(root["relativizer_kind"], "locative")
        self.assertEqual(root["relative_binding"], "object")
        self.assertEqual(root["relative_antecedent"], "floresta")

    def test_relative_pronoun_normalization_is_deterministic(self) -> None:
        sentence = "O lobo viu o cão, o qual atacou a floresta."
        snapshots = [
            self.language.analyze(sentence).clauses[0]
            for _ in range(20)
        ]
        self.assertEqual(
            len({
                (
                    x.relativizer,
                    x.relativizer_kind,
                    x.relative_binding,
                    x.relative_antecedent,
                    tuple((r.subject, r.relation, r.object) for r in x.relative),
                )
                for x in snapshots
            }),
            1,
        )


if __name__ == "__main__":
    unittest.main()

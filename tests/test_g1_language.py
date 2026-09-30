from __future__ import annotations

import unittest

from griot_language import LanguageIntelligence


class TestLanguageIntelligence(unittest.TestCase):
    def setUp(self) -> None:
        self.language = LanguageIntelligence()

    def test_present_past_future_and_conditional(self) -> None:
        self.assertEqual(self.language.analyze("João ataca o lobo.").clauses[0].tense, "present")
        self.assertEqual(self.language.analyze("João atacou o lobo.").clauses[0].tense, "past_perfect")
        self.assertEqual(self.language.analyze("João atacará o lobo.").clauses[0].tense, "future")
        self.assertEqual(self.language.analyze("João atacaria o lobo.").clauses[0].tense, "conditional")

    def test_progressive_and_perfect_aspect(self) -> None:
        progressive = self.language.analyze("João estava atacando o lobo.").clauses[0]
        perfect = self.language.analyze("João tinha atacado o lobo.").clauses[0]
        self.assertEqual(progressive.aspect, "progressive")
        self.assertEqual(perfect.aspect, "perfect")

    def test_semantic_roles(self) -> None:
        clause = self.language.analyze("João deu o livro para Maria na escola com uma caneta.").clauses[0]
        roles = {role.role for role in clause.roles}
        self.assertIn("agent", roles)
        self.assertIn("patient", roles)
        self.assertIn("recipient", roles)
        self.assertIn("location", roles)
        self.assertIn("instrument", roles)

    def test_negation_and_modality(self) -> None:
        clause = self.language.analyze("João não pode atacar o lobo.").clauses[0]
        self.assertTrue(clause.negated)
        self.assertEqual(clause.modality, "possibility")

    def test_quantifier_and_comparison(self) -> None:
        analysis = self.language.analyze("Todos os lobos são mais rápidos do que os cães.")
        self.assertEqual(analysis.quantifiers[0].kind, "universal")
        self.assertIsNotNone(analysis.comparisons[0])
        self.assertEqual(analysis.comparisons[0].operator, "greater_than")

    def test_conditional(self) -> None:
        analysis = self.language.analyze("Se chover, então a floresta fica molhada.")
        self.assertEqual(len(analysis.conditionals), 1)
        conditional = analysis.conditionals[0]
        self.assertIn("chover", conditional.condition)
        self.assertIn("floresta", conditional.consequent)

    def test_token_morphology(self) -> None:
        tokens = self.language.tokenize("João atacou.")
        attack = next(token for token in tokens if token.text.casefold() == "atacou")
        self.assertEqual(attack.pos, "VERB")
        self.assertEqual(attack.lemma, "atacar")
        self.assertEqual(attack.tense, "past_perfect")

    def test_unknown_language_stays_safe(self) -> None:
        analysis = self.language.analyze("Uma estrutura desconhecida existe aqui.")
        self.assertTrue(analysis.tokens)
        self.assertIsInstance(analysis.clauses, tuple)

    def test_common_noun_is_not_mistagged_as_present_verb(self) -> None:
        tokens = self.language.tokenize("A casa bonita.")
        casa = next(token for token in tokens if token.text.casefold() == "casa")
        self.assertEqual(casa.pos, "WORD")
        self.assertIsNone(casa.tense)


if __name__ == "__main__":
    unittest.main()

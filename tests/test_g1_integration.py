from __future__ import annotations

import unittest

from griot_engine import GRIOT
from griot_semantic_ir import SemanticGRIOT


class TestG1SemanticIntegration(unittest.TestCase):
    def test_language_analysis_is_embedded_in_gir(self) -> None:
        engine = GRIOT.create()
        meaning = SemanticGRIOT(engine).understand(
            "João estava atacando o lobo ontem."
        )
        language = meaning.constraints["language"]
        clause = language["clauses"][0]
        self.assertEqual(clause["relation"], "attacks")
        self.assertEqual(clause["tense"], "past_imperfect")
        self.assertEqual(clause["aspect"], "progressive")
        self.assertTrue(any(role["role"] == "agent" for role in clause["roles"]))
        self.assertTrue(any(token["lemma"] == "atacar" for token in language["tokens"]))

    def test_near_future_reaches_gir(self) -> None:
        engine = GRIOT.create()
        meaning = SemanticGRIOT(engine).understand("Maria vai criar um projeto.")
        clause = meaning.constraints["language"]["clauses"][0]
        self.assertEqual(clause["tense"], "near_future")
        self.assertEqual(clause["relation"], "creates")


if __name__ == "__main__":
    unittest.main()

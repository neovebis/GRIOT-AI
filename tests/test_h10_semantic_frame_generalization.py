from __future__ import annotations

import unittest

from griot_engine import GRIOT
from griot_language import LanguageIntelligence
from griot_reasoning_v040 import ReasoningEngine, TruthStatus
from griot_semantic_grammar import SemanticGrammar
from griot_semantic_ir import SemanticGRIOT


class H10SemanticFrameGeneralizationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.language = LanguageIntelligence()
        self.semantic = SemanticGRIOT(self.engine)
        self.grammar = SemanticGrammar(self.engine)
        self.reasoning = ReasoningEngine(self.semantic)

    def _clause(self, text: str):
        return self.language.analyze(text).clauses[0]

    def test_canonical_verb_has_expected_frame(self) -> None:
        frame = self.grammar.frame_for_clause(self._clause("O lobo ataca o cão."))
        self.assertIsNotNone(frame)
        self.assertEqual(frame.lemma, "atacar")
        self.assertEqual(frame.relation, "attacks")
        self.assertEqual(frame.transitivity, "transitive")

    def test_synonym_verb_reuses_canonical_frame(self) -> None:
        frame = self.grammar.frame_for_clause(self._clause("O lobo agride o cão."))
        self.assertIsNotNone(frame)
        self.assertEqual(frame.lemma, "atacar")
        self.assertEqual(frame.relation, "attacks")

    def test_inflected_synonym_reuses_canonical_frame(self) -> None:
        frame = self.grammar.frame_for_clause(self._clause("Os lobos agrediram o cão."))
        self.assertIsNotNone(frame)
        self.assertEqual(frame.lemma, "atacar")
        self.assertEqual(frame.relation, "attacks")

    def test_near_future_synonym_reuses_canonical_frame(self) -> None:
        clause = self._clause("Maria vai observar o projeto.")
        frame = self.grammar.frame_for_clause(clause)
        self.assertIsNotNone(frame)
        self.assertEqual(frame.relation, "sees")
        self.assertEqual(clause.relation, "sees")
        self.assertEqual(clause.tense, "near_future")

    def test_selectional_restriction_matches_canonical_and_synonym(self) -> None:
        canonical = self.grammar.analyze("O lobo ataca o cão.")
        synonym = self.grammar.analyze("O lobo agride o cão.")
        self.assertEqual(canonical.selectional[0].status, synonym.selectional[0].status)
        self.assertEqual(canonical.selectional[0].relation, synonym.selectional[0].relation)
        self.assertEqual(canonical.selectional[0].status, "valid")

    def test_unknown_verb_remains_unsupported(self) -> None:
        analysis = self.grammar.analyze("O lobo acaricia o cão.")
        self.assertEqual(analysis.frames, ())
        self.assertIn("unsupported-verb:acaricia", analysis.abstain_reasons)

    def test_governed_preposition_survives_frame_resolution(self) -> None:
        analysis = self.grammar.analyze("O lobo precisa de água.")
        self.assertTrue(analysis.frames)
        self.assertEqual(analysis.frames[0].relation, "needs")
        self.assertEqual(analysis.governance[0].status, "valid")

    def test_frame_equivalence_is_explicit(self) -> None:
        texts = (
            "O lobo ataca o cão.",
            "O lobo agride o cão.",
            "O lobo agrediu o cão.",
        )
        relations = []
        frames = []
        for text in texts:
            analysis = self.grammar.analyze(text)
            relations.append(analysis.frames[0].relation)
            frames.append(analysis.frames[0].lemma)
        self.assertEqual(relations, ["attacks", "attacks", "attacks"])
        self.assertEqual(frames, ["atacar", "atacar", "atacar"])

    def test_frame_metadata_is_embedded_in_gir_grammar_constraints(self) -> None:
        meaning = self.semantic.understand("O lobo agride o cão.")
        grammar = meaning.constraints["grammar"]
        frame = grammar["frames"][0]
        self.assertEqual(frame["lemma"], "atacar")
        self.assertEqual(frame["relation"], "attacks")

    def test_atomic_quids_survive_frame_generalization(self) -> None:
        meaning = self.semantic.understand("O lobo agride o cão.")
        self.assertTrue(all(len(node.quid) == 1 for node in meaning.nodes))

    def test_semantic_relation_is_unchanged_by_frame_generalization(self) -> None:
        self.semantic.learn("O lobo agride o cão.", "h10")
        result = self.reasoning.reason("O lobo ataca o cão?")
        self.assertEqual(result.status, TruthStatus.SUPPORTED)

    def test_alias_and_canonical_have_same_selectional_contract(self) -> None:
        for sentence in (
            "O lobo ataca o cão.",
            "O lobo agride o cão.",
            "O lobo agrediu o cão.",
        ):
            analysis = self.grammar.analyze(sentence)
            self.assertEqual(len(analysis.selectional), 1)
            self.assertEqual(analysis.selectional[0].relation, "attacks")
            self.assertEqual(analysis.selectional[0].status, "valid")

    def test_frame_resolution_is_deterministic(self) -> None:
        sentence = "O lobo agride o cão."
        snapshots = []
        for _ in range(20):
            clause = self._clause(sentence)
            frame = self.grammar.frame_for_clause(clause)
            snapshots.append((frame.lemma, frame.relation, frame.transitivity))
        self.assertEqual(len(set(snapshots)), 1)


if __name__ == "__main__":
    unittest.main()

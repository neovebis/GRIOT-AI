from __future__ import annotations

import unittest

from griot_engine import GRIOT
from griot_language import LanguageIntelligence
from griot_lexical_semantics import SemanticLexicon
from griot_reasoning_v040 import ReasoningEngine, TruthStatus
from griot_semantic_ir import SemanticGRIOT


class H9LexicalGeneralizationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.language = LanguageIntelligence()
        self.semantic = SemanticGRIOT(self.engine)
        self.reasoning = ReasoningEngine(self.semantic)

    def test_aliases_resolve_to_same_relation(self) -> None:
        pairs = (
            ("atacar", "agredir", "attacks"),
            ("ver", "observar", "sees"),
            ("usar", "utilizar", "uses"),
            ("construir", "edificar", "builds"),
            ("ajudar", "auxiliar", "helps"),
            ("querer", "desejar", "wants"),
            ("precisar", "necessitar", "needs"),
        )
        for canonical, alias, relation in pairs:
            with self.subTest(canonical=canonical, alias=alias):
                self.assertEqual(SemanticLexicon.relation_for_verb(canonical), relation)
                self.assertEqual(SemanticLexicon.relation_for_verb(alias), relation)

    def test_inflected_alias_resolves_to_canonical_lemma(self) -> None:
        cases = (
            ("agrediu", "agredir", "attacks"),
            ("agrediram", "agredir", "attacks"),
            ("observaram", "observar", "sees"),
            ("utilizaram", "utilizar", "uses"),
            ("edificaram", "edificar", "builds"),
            ("auxiliaram", "auxiliar", "helps"),
            ("desejaram", "desejar", "wants"),
            ("necessitaram", "necessitar", "needs"),
        )
        for surface, lemma, relation in cases:
            with self.subTest(surface=surface):
                resolved = SemanticLexicon.resolve_verb(surface)
                self.assertIsNotNone(resolved)
                self.assertEqual(resolved.lemma, lemma)
                self.assertEqual(resolved.relation, relation)
                self.assertEqual(resolved.source, "inflection")

    def test_language_parser_maps_synonymous_verb_to_canonical_relation(self) -> None:
        variants = (
            ("O lobo ataca o cão.", "attacks"),
            ("O lobo agride o cão.", "attacks"),
            ("O lobo agride o cão.", "attacks"),
        )
        for sentence, relation in variants:
            with self.subTest(sentence=sentence):
                clause = self.language.analyze(sentence).clauses[0]
                self.assertEqual(clause.relation, relation)
                self.assertEqual(clause.subject, "lobo")
                self.assertEqual(clause.object, "cão")

    def test_inflected_synonym_maps_in_full_clause(self) -> None:
        clause = self.language.analyze("Os lobos agrediram o cão.").clauses[0]
        self.assertEqual(clause.relation, "attacks")
        self.assertEqual(clause.verb, "agrediram")
        self.assertEqual(clause.subject, "lobos")
        self.assertEqual(clause.object, "cão")

    def test_near_future_preserves_lexical_head(self) -> None:
        clause = self.language.analyze("Maria vai observar o projeto.").clauses[0]
        self.assertEqual(clause.relation, "sees")
        self.assertEqual(clause.tense, "near_future")
        self.assertEqual(clause.subject, "Maria")
        self.assertEqual(clause.object, "projeto")

    def test_phrase_paraphrases_map_to_canonical_relations(self) -> None:
        cases = (
            ("O coração é parte integrante do sistema.", "part_of"),
            ("O investigador é integrante do grupo.", "member_of"),
            ("O motor é composto pela estrutura.", "composed_of"),
            ("Maria está localizada no Porto.", "located_in"),
            ("Maria encontra-se no Porto.", "located_in"),
            ("Maria reside no Porto.", "located_in"),
            ("Maria mora no Porto.", "located_in"),
            ("Maria habita no Porto.", "located_in"),
        )
        for sentence, relation in cases:
            with self.subTest(sentence=sentence):
                clause = self.language.analyze(sentence).clauses[0]
                self.assertEqual(clause.relation, relation)

    def test_alias_reaches_gir_edge(self) -> None:
        meaning = self.semantic.understand("O lobo agride o cão.")
        self.assertTrue(
            meaning.nodes,
            f"no GIR nodes; language={meaning.constraints.get('language')!r}; lexical={meaning.constraints.get('lexical')!r}",
        )
        self.assertTrue(
            any(edge.relation == "attacks" for edge in meaning.edges),
            f"no attacks edge; nodes={meaning.nodes!r}; language={meaning.constraints.get('language')!r}; edges={meaning.edges!r}",
        )

    def test_lexical_resolution_is_embedded_in_gir(self) -> None:
        meaning = self.semantic.understand("O lobo agride o cão.")
        lexical = meaning.constraints["lexical"]
        self.assertTrue(lexical)
        self.assertTrue(any(item["surface"] == "agride" for item in lexical))
        self.assertTrue(any(item["relation"] == "attacks" for item in lexical))

    def test_synonym_learning_supports_canonical_query(self) -> None:
        self.semantic.learn("O lobo agride o cão.", "h9")
        result = self.reasoning.reason("O lobo ataca o cão?")
        self.assertEqual(result.status, TruthStatus.SUPPORTED)
        self.assertTrue(result.proofs)

    def test_canonical_learning_supports_synonym_query(self) -> None:
        self.semantic.learn("O lobo ataca o cão.", "h9")
        result = self.reasoning.reason("O lobo agride o cão?")
        self.assertEqual(result.status, TruthStatus.SUPPORTED)
        self.assertTrue(result.proofs)

    def test_morphological_learning_supports_lemma_query(self) -> None:
        self.semantic.learn("O lobo agrediu o cão.", "h9")
        result = self.reasoning.reason("O lobo ataca o cão?")
        self.assertEqual(result.status, TruthStatus.SUPPORTED)

    def test_unknown_verb_does_not_get_invented_relation(self) -> None:
        clause = self.language.analyze("O lobo acaricia o cão.").clauses[0]
        self.assertIsNone(clause.relation)
        self.assertIsNone(SemanticLexicon.resolve_verb("acaricia"))

    def test_unknown_vocabulary_stays_unknown_in_reasoning(self) -> None:
        result = self.reasoning.reason("O lobo acaricia o cão?")
        self.assertEqual(result.status, TruthStatus.UNKNOWN)

    def test_atomic_quids_survive_lexical_generalization(self) -> None:
        meaning = self.semantic.understand("O lobo agride o cão.")
        self.assertTrue(all(len(node.quid) == 1 for node in meaning.nodes))

    def test_relation_fingerprint_matches_across_synonyms(self) -> None:
        a = self.semantic.understand("O lobo ataca o cão.")
        b = self.semantic.understand("O lobo agride o cão.")
        a_edges = {(edge.relation, edge.negated) for edge in a.edges}
        b_edges = {(edge.relation, edge.negated) for edge in b.edges}
        self.assertEqual(a_edges, b_edges)

    def test_alias_resolution_is_case_and_whitespace_stable(self) -> None:
        self.assertEqual(
            SemanticLexicon.relation_for_verb("  AGREDIR  "),
            SemanticLexicon.relation_for_verb("agredir"),
        )

    def test_regular_inflection_does_not_override_function_words(self) -> None:
        analysis = self.language.analyze("Esta casa é grande.")
        self.assertNotEqual(analysis.tokens[0].pos, "VERB")
        self.assertEqual(analysis.tokens[0].pos, "DET")

    def test_lexical_layer_is_deterministic(self) -> None:
        samples = (
            "agride",
            "agrediram",
            "observava",
            "utilizarão",
            "edificaram",
            "necessitava",
        )
        snapshots = [
            tuple(
                (item.surface, item.lemma, item.relation, item.source)
                for item in SemanticLexicon.analyze(" ".join(samples))
            )
            for _ in range(20)
        ]
        self.assertEqual(len(set(snapshots)), 1)

    def test_generated_forms_are_bounded_to_known_verbs(self) -> None:
        self.assertIsNone(SemanticLexicon.resolve_verb("blablabla"))
        self.assertIsNone(SemanticLexicon.resolve_verb("xyzaram"))

    def test_semantic_lexicon_does_not_change_unknown_entities(self) -> None:
        meaning = self.semantic.understand("O dragão agride o cavaleiro.")
        self.assertEqual(
            [node.surface for node in meaning.nodes],
            ["dragão", "cavaleiro"],
        )

    def test_multi_sentence_synonym_compilation_preserves_relations(self) -> None:
        meaning = self.semantic.understand(
            "O lobo agride o cão. O lobo observa o caçador."
        )
        relations = [edge.relation for edge in meaning.edges if edge.relation not in {"has_agent", "has_patient"}]
        self.assertIn("attacks", relations)
        self.assertIn("sees", relations)


if __name__ == "__main__":
    unittest.main()

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
            [node.surface for node in meaning.nodes if node.kind == "entity"],
            ["dragão", "cavaleiro"],
        )

    def test_multi_sentence_synonym_compilation_preserves_relations(self) -> None:
        meaning = self.semantic.understand(
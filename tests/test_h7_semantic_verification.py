from __future__ import annotations

import unittest

from griot_advanced_reasoning import AdvancedReasoningEngine
from griot_engine import GRIOT
from griot_semantic_grammar import SemanticGrammar
from griot_semantic_ir import SemanticGRIOT


SELECTION_VALID = [
    "O leão come carne.",
    "O lobo come carne.",
    "A raposa come carne.",
    "O gato come pão.",
    "O João come carne.",
    "O leão ataca o lobo.",
    "O lobo ataca o cão.",
    "A pessoa ataca o leão.",
    "O João vê o carro.",
    "O leão vê o lobo.",
    "O João usa o carro.",
    "O João usa a caneta.",
    "O João constrói o carro.",
    "O leão constrói a casa.",
    "O João cria um livro.",
    "O leão ajuda o lobo.",
    "O João fere o lobo.",
    "O João quer o carro.",
    "O João precisa de água.",
    "O leão está na floresta."
]
SELECTION_INVALID = [
    "O carro come carne.",
    "A carne come o pão.",
    "O carro ataca o lobo.",
    "O livro ataca o leão.",
    "O leão ataca o carro.",
    "O leão come o carro.",
    "O leão usa carne.",
    "A carne usa o carro.",
    "O carro fere o lobo.",
    "A casa fere o lobo.",
    "O leão está no motor.",
    "O carro está no motor."
]
SELECTION_UNKNOWN = [
    "O dragão come carne.",
    "O leão come zumbrax.",
    "O dragão ataca o lobo.",
    "O lobo ataca zumbrax.",
    "O dragão usa o carro.",
    "O leão usa zumbrax.",
    "O dragão precisa de água.",
    "O dragão está na floresta."
]

AGREEMENT_VALID = [
    "O leão.",
    "A raposa.",
    "Os leões.",
    "As raposas.",
    "O carro.",
    "Os carros.",
    "A casa.",
    "As casas.",
    "O livro.",
    "Uma caneta.",
    "Uns livros.",
    "Umas canetas.",
    "O colega.",
    "A colega.",
    "Os colegas.",
    "As colegas.",
    "O leão feroz.",
    "Os leões ferozes.",
    "A raposa mansa.",
    "As raposas mansas.",
    "O carro grande.",
    "Os carros grandes.",
    "O leão é felino.",
    "Os leões são felinos.",
    "O leão tem um motor.",
    "Os leões têm um motor.",
    "O leão ataca o lobo.",
    "Os leões atacam o lobo.",
    "O lobo come carne.",
    "Os lobos comem carne."
]
AGREEMENT_INVALID = [
    "A leão.",
    "O raposa.",
    "Os leão.",
    "As leão.",
    "Um raposa.",
    "Uma lobo.",
    "O leões.",
    "A leões.",
    "Um casas.",
    "Uma carros.",
    "O livros.",
    "As livro.",
    "O leão ferozes.",
    "O leão mansa.",
    "A raposa manso.",
    "Os leões feroz.",
    "Os leões é felinos.",
    "O leão são felinos.",
    "Os leões tem um motor.",
    "O leão têm um motor.",
    "Os leões ataca o lobo.",
    "O leão atacam o lobo.",
    "Os lobos come carne.",
    "O lobo comem carne.",
    "O carro bonita.",
    "A casa bonito.",
    "As casas bonito.",
    "Os carros bonitas.",
    "Os livros bonita."
]

COORDINATION = [
    [
        "O carro e o leão têm motor.",
        "e",
        "subject",
        "valid"
    ],
    [
        "O leão e o lobo atacam a raposa.",
        "e",
        "subject",
        "valid"
    ],
    [
        "O leão ou o lobo atacam a raposa.",
        "ou",
        "subject",
        "valid"
    ],
    [
        "O leão e o carro atacam o lobo.",
        "e",
        "subject",
        "invalid"
    ],
    [
        "O leão ou o carro atacam o lobo.",
        "ou",
        "subject",
        "valid"
    ],
    [
        "O leão come carne e pão.",
        "e",
        "object",
        "valid"
    ],
    [
        "O leão come carne ou pão.",
        "ou",
        "object",
        "valid"
    ],
    [
        "O leão come carne e o carro.",
        "e",
        "object",
        "invalid"
    ],
    [
        "O leão come carne ou o carro.",
        "ou",
        "object",
        "valid"
    ],
    [
        "O dragão e o lobo atacam o gato.",
        "e",
        "subject",
        "unknown"
    ],
    [
        "O dragão ou o lobo atacam o gato.",
        "ou",
        "subject",
        "valid"
    ],
    [
        "O leão e o dragão comem carne.",
        "e",
        "subject",
        "unknown"
    ],
    [
        "O leão ou o dragão comem carne.",
        "ou",
        "subject",
        "valid"
    ],
    [
        "O carro e o livro usam a caneta.",
        "e",
        "subject",
        "invalid"
    ],
    [
        "O João e a Maria usam a caneta.",
        "e",
        "subject",
        "valid"
    ],
    [
        "O João ou a Maria usam a caneta.",
        "ou",
        "subject",
        "valid"
    ],
    [
        "O leão come carne e zumbrax.",
        "e",
        "object",
        "unknown"
    ],
    [
        "O leão come carne ou zumbrax.",
        "ou",
        "object",
        "valid"
    ],
    [
        "O leão vê o carro e o livro.",
        "e",
        "object",
        "valid"
    ],
    [
        "O leão vê o carro ou zumbrax.",
        "ou",
        "object",
        "valid"
    ]
]
GOVERNANCE_VALID = [
    "O João precisa de água.",
    "O João precisa de carne.",
    "O leão precisa de água.",
    "O lobo precisa de carne.",
    "O leão está em casa.",
    "O leão está no carro.",
    "O leão está na floresta.",
    "O lobo está nos campos.",
    "O lobo está nas montanhas.",
    "O leão habita em savana.",
    "O lobo habita na floresta.",
    "O leão vive em casa.",
    "O lobo vive na floresta."
]
GOVERNANCE_INVALID = [
    "O João precisa água.",
    "O João precisa o carro.",
    "O leão precisa carne.",
    "O leão está sobre o motor.",
    "O leão está entre o carro.",
    "O leão habita sobre a savana.",
    "O lobo vive sobre a floresta.",
    "O leão precisa sem água."
]

QUERY_CASES = [
    [
        "O que causa a erosão?",
        "subject",
        "causes",
        "erosão"
    ],
    [
        "Quem causa a erosão?",
        "subject",
        "causes",
        "erosão"
    ],
    [
        "O que tem o carro?",
        "object",
        "has",
        "carro"
    ],
    [
        "Quem tem o carro?",
        "subject",
        "has",
        "carro"
    ],
    [
        "O que o carro tem?",
        "object",
        "has",
        "carro"
    ],
    [
        "Onde está o leão?",
        "location",
        "located_in",
        "leão"
    ],
    [
        "Onde vive o lobo?",
        "location",
        "located_in",
        "lobo"
    ],
    [
        "Quem atacou o lobo?",
        "subject",
        "attacks",
        "lobo"
    ],
    [
        "Quem comeu a carne?",
        "subject",
        "eats",
        "carne"
    ],
    [
        "Quem viu o carro?",
        "subject",
        "sees",
        "carro"
    ],
    [
        "O que o leão atacou?",
        "object",
        "attacks",
        "leão"
    ],
    [
        "O que o lobo comeu?",
        "object",
        "eats",
        "lobo"
    ],
    [
        "O que a pessoa usou?",
        "object",
        "uses",
        "pessoa"
    ],
    [
        "O que o João criou?",
        "object",
        "creates",
        "João"
    ],
    [
        "Quem ajudou o lobo?",
        "subject",
        "helps",
        "lobo"
    ],
    [
        "Quem feriu o lobo?",
        "subject",
        "hurts",
        "lobo"
    ],
    [
        "O que o João quer?",
        "object",
        "wants",
        "João"
    ],
    [
        "Quem precisa do carro?",
        "subject",
        "needs",
        "carro"
    ],
    [
        "Por que existe fumaça?",
        "cause",
        "causes",
        "existe fumaça"
    ],
    [
        "Por que existe erosão?",
        "cause",
        "causes",
        "existe erosão"
    ]
]


class SemanticGrammarMatrixTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.grammar = SemanticGrammar(self.engine)

    def test_coordination_truth_table(self) -> None:
        truth = SemanticGrammar.coordination_truth
        self.assertTrue(truth("e", (True, True, True)))
        self.assertFalse(truth("e", (True, False, True)))
        self.assertTrue(truth("ou", (False, True, False)))
        self.assertFalse(truth("ou", (False, False, False)))
        for bad in ("xor", "and", "or", ""):
            with self.subTest(operator=bad):
                with self.assertRaises(ValueError):
                    truth(bad, (True,))
        with self.assertRaises(ValueError):
            truth("e", ())

    def test_determinism_corpus(self) -> None:
        corpus = tuple(dict.fromkeys(
            SELECTION_VALID + SELECTION_INVALID + SELECTION_UNKNOWN
            + AGREEMENT_VALID + AGREEMENT_INVALID
            + [case[0] for case in COORDINATION]
            + GOVERNANCE_VALID + GOVERNANCE_INVALID
            + [case[0] for case in QUERY_CASES]
        ))
        self.assertGreaterEqual(len(corpus), 120)
        for text in corpus:
            with self.subTest(text=text):
                signatures = []
                for _ in range(5):
                    result = self.grammar.analyze(text)
                    signatures.append(repr(result.to_dict()))
                self.assertEqual(len(set(signatures)), 1)


def _selection_case(text: str, expected: str):
    def test(self: SemanticGrammarMatrixTests) -> None:
        result = self.grammar.analyze(text)
        self.assertEqual(len(result.selectional), 1)
        self.assertEqual(result.selectional[0].status, expected)
    return test


def _agreement_case(text: str, expected_valid: bool):
    def test(self: SemanticGrammarMatrixTests) -> None:
        result = self.grammar.analyze(text)
        self.assertEqual(not result.agreement, expected_valid)
    return test


def _coordination_case(text: str, operator: str, side: str, expected: str):
    def test(self: SemanticGrammarMatrixTests) -> None:
        result = self.grammar.analyze(text)
        self.assertEqual(len(result.coordination), 1)
        item = result.coordination[0]
        self.assertEqual(item.operator, operator)
        self.assertEqual(item.side, side)
        self.assertEqual(item.status, expected)
        self.assertEqual(item.semantics, "all" if operator == "e" else "any")
    return test


def _governance_case(text: str, expected: str):
    def test(self: SemanticGrammarMatrixTests) -> None:
        result = self.grammar.analyze(text)
        self.assertEqual(len(result.governance), 1)
        self.assertEqual(result.governance[0].status, expected)
    return test


def _query_case(text: str, kind: str, relation: str, anchor: str):
    def test(self: SemanticGrammarMatrixTests) -> None:
        result = self.grammar.analyze(text)
        self.assertTrue(result.queries)
        query = result.queries[0]
        self.assertEqual(query.kind, kind)
        self.assertEqual(query.relation, relation)
        self.assertEqual(query.anchor, anchor)
        self.assertEqual(query.variable in {"?x", "?cause"}, True)
    return test


for _index, _text in enumerate(SELECTION_VALID, 1):
    setattr(SemanticGrammarMatrixTests, f"test_selection_valid_{_index:03d}", _selection_case(_text, "valid"))

for _index, _text in enumerate(SELECTION_INVALID, 1):
    setattr(SemanticGrammarMatrixTests, f"test_selection_invalid_{_index:03d}", _selection_case(_text, "invalid"))

for _index, _text in enumerate(SELECTION_UNKNOWN, 1):
    setattr(SemanticGrammarMatrixTests, f"test_selection_unknown_{_index:03d}", _selection_case(_text, "unknown"))

for _index, _text in enumerate(AGREEMENT_VALID, 1):
    setattr(SemanticGrammarMatrixTests, f"test_agreement_valid_{_index:03d}", _agreement_case(_text, True))

for _index, _text in enumerate(AGREEMENT_INVALID, 1):
    setattr(SemanticGrammarMatrixTests, f"test_agreement_invalid_{_index:03d}", _agreement_case(_text, False))

for _index, (_text, _operator, _side, _expected) in enumerate(COORDINATION, 1):
    setattr(
        SemanticGrammarMatrixTests,
        f"test_coordination_{_index:03d}",
        _coordination_case(_text, _operator, _side, _expected),
    )

for _index, _text in enumerate(GOVERNANCE_VALID, 1):
    setattr(SemanticGrammarMatrixTests, f"test_governance_valid_{_index:03d}", _governance_case(_text, "valid"))

for _index, _text in enumerate(GOVERNANCE_INVALID, 1):
    setattr(SemanticGrammarMatrixTests, f"test_governance_invalid_{_index:03d}", _governance_case(_text, "invalid"))

for _index, (_text, _kind, _relation, _anchor) in enumerate(QUERY_CASES, 1):
    setattr(
        SemanticGrammarMatrixTests,
        f"test_query_{_index:03d}",
        _query_case(_text, _kind, _relation, _anchor),
    )


class GRIOTH7IntegrationTests(unittest.TestCase):
    def test_grammar_is_embedded_in_gir_without_changing_qid_identity(self) -> None:
        engine = GRIOT.create()
        meaning = SemanticGRIOT(engine).understand("O leão come carne.")
        grammar = meaning.constraints["grammar"]
        self.assertTrue(grammar["valid"])
        self.assertEqual(grammar["selectional"][0]["status"], "valid")
        self.assertTrue(all(len(node.quid) == 1 for node in meaning.nodes))

    def test_invalid_semantics_remain_explicit_in_gir(self) -> None:
        engine = GRIOT.create()
        meaning = SemanticGRIOT(engine).understand("O leão come o carro.")
        grammar = meaning.constraints["grammar"]
        self.assertFalse(grammar["valid"])
        self.assertIn("selectional-restriction", grammar["abstain_reasons"])

    def test_open_question_structure_is_embedded_in_gir(self) -> None:
        engine = GRIOT.create()
        meaning = SemanticGRIOT(engine).understand("O que causa a erosão?")
        grammar = meaning.constraints["grammar"]
        self.assertEqual(grammar["queries"][0]["variable"], "?x")
        self.assertEqual(grammar["queries"][0]["relation"], "causes")

    def test_g3_does_not_recompile_when_gir_is_supplied(self) -> None:
        engine = GRIOT.create()
        meaning = SemanticGRIOT(engine).understand("O leão é um animal?")
        advanced = AdvancedReasoningEngine(engine)
        advanced.semantic.understand = lambda _text: (_ for _ in ()).throw(
            AssertionError("hidden semantic recompilation")
        )
        result = advanced.solve("O leão é um animal?", meaning=meaning, decompose=False)
        self.assertIs(result.result.meaning, meaning)

    def test_grammar_analysis_is_stable_when_reused_language_analysis(self) -> None:
        engine = GRIOT.create()
        semantic = SemanticGRIOT(engine)
        language = semantic.compiler.language.analyze("O leão estava atacando o lobo ontem.")
        first = semantic.compiler.grammar.analyze(language.text, language)
        second = semantic.compiler.grammar.analyze(language.text, language)
        self.assertEqual(first.to_dict(), second.to_dict())
        self.assertEqual(first.frames[0].relation, "attacks")


if __name__ == "__main__":
    unittest.main()

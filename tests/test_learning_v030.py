import unittest

from griot_learning_v030 import KnowledgeInducer


class KnowledgeInductionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.inducer = KnowledgeInducer()

    def test_nested_definition(self):
        report = self.inducer.induce("O leão é um mamífero que possui uma juba.")
        self.assertGreaterEqual(report.committed, 2)
        lion = self.inducer.semantic.engine.quids.get("leão")
        mammal = self.inducer.semantic.engine.quids.get("mamífero")
        mane = self.inducer.semantic.engine.quids.get("juba")
        self.assertIsNotNone(lion)
        self.assertIsNotNone(mammal)
        self.assertIsNotNone(mane)
        assert lion and mammal and mane
        facts = self.inducer.semantic.engine.graph.facts()
        self.assertTrue(any(f.subject == lion.symbol and f.relation == "is_a" and f.object == mammal.symbol for f in facts))
        self.assertTrue(any(f.subject == lion.symbol and f.relation == "has" and f.object == mane.symbol for f in facts))

    def test_numeric_range(self):
        report = self.inducer.induce("O leão pesa entre 150 e 250 kg.")
        self.assertGreaterEqual(report.committed, 3)
        lion = self.inducer.semantic.engine.quids.get("leão")
        assert lion is not None
        facts = [f for f in self.inducer.semantic.engine.graph.facts() if f.subject == lion.symbol]
        self.assertTrue({"has_min_value", "has_max_value", "has_unit"}.issubset({f.relation for f in facts}))

    def test_conditional(self):
        report = self.inducer.induce("Se o leão ataca a presa, então a presa foge.")
        self.assertGreaterEqual(report.committed, 2)
        self.assertTrue(any(f.relation == "implies" for f in self.inducer.semantic.engine.graph.facts()))

    def test_contradiction(self):
        self.inducer.induce("O leão é um mamífero.")
        report = self.inducer.induce("O leão não é um mamífero.")
        self.assertGreaterEqual(report.contradictions, 1)


if __name__ == "__main__":
    unittest.main()

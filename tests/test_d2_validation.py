import unittest
from dataclasses import replace

from griot_engine import Fact, GRIOT
from griot_extraction import ExtractionCandidate, ExtractionBatch
from griot_semantic_ir import SemanticGRIOT
from griot_validation import KnowledgeValidator, ValidationStatus
from quid_core import Quid


class ValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.semantic = SemanticGRIOT(self.engine)
        self.validator = KnowledgeValidator(self.engine)
        self.quid = Quid(self.engine)

    def test_new_fact_is_valid(self) -> None:
        batch = self.quid.extract_knowledge("O leão é um animal.")
        report = self.quid.validate_knowledge(batch)
        self.assertTrue(report.can_commit)
        self.assertEqual(report.valid[0].status, ValidationStatus.VALID)

    def test_identical_fact_is_duplicate(self) -> None:
        self.engine.learn("O leão é um animal.", source="memory")
        batch = self.quid.extract_knowledge("O leão é um animal.")
        report = self.validator.validate(batch)
        self.assertEqual(report.candidates[0].status, ValidationStatus.DUPLICATE)

    def test_opposite_polarity_is_conflict(self) -> None:
        self.engine.learn("O leão é um animal.", source="memory")
        batch = self.quid.extract_knowledge("O leão não é um animal.")
        report = self.validator.validate(batch)
        self.assertEqual(report.candidates[0].status, ValidationStatus.CONFLICT)
        self.assertFalse(report.can_commit)

    def test_unknown_relation_is_invalid(self) -> None:
        gir = self.semantic.understand("leão é um animal")
        fact = Fact(gir.nodes[0].quid, "made_up_relation", gir.nodes[-1].quid, 1.0, False, "test")
        candidate = ExtractionCandidate(fact, "raw", gir.fingerprint(), 1.0)
        batch = ExtractionBatch("raw", gir, (candidate,))
        report = self.validator.validate(batch)
        self.assertEqual(report.candidates[0].status, ValidationStatus.INVALID)

    def test_validation_never_mutates_graph(self) -> None:
        batch = self.quid.extract_knowledge("O leão é um animal.")
        before = set(self.engine.graph.facts())
        self.validator.validate(batch)
        self.assertEqual(set(self.engine.graph.facts()), before)

    def test_quid_validation_has_explicit_rejection_reason(self) -> None:
        self.engine.learn("O leão é um animal.", source="memory")
        report = self.quid.validate_knowledge(
            self.quid.extract_knowledge("O leão não é um animal.")
        )
        self.assertEqual(report.rejected[0].issues[0].code, "contradiction")


if __name__ == "__main__":
    unittest.main()

import unittest

from griot_engine import GRIOT
from griot_consolidation import KnowledgeConsolidator
from griot_deduplication import SemanticDeduplicator
from griot_semantic_ir import SemanticGRIOT
from griot_validation import KnowledgeValidator
from quid_core import Quid


class ConsolidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.quid = Quid(self.engine)
        self.semantic = SemanticGRIOT(self.engine)
        self.validator = KnowledgeValidator(self.engine)
        self.dedup = SemanticDeduplicator()
        self.consolidator = KnowledgeConsolidator(self.engine)

    def _pipeline(self, text: str):
        batch = self.quid.extract_knowledge(text)
        validation = self.validator.validate(batch)
        dedup = self.dedup.deduplicate(item.candidate for item in validation.valid)
        return batch, validation, dedup

    def test_valid_knowledge_is_committed(self) -> None:
        batch, validation, dedup = self._pipeline("O leão é um animal.")
        report = self.consolidator.consolidate(validation, dedup)

        self.assertTrue(report.changed)
        self.assertEqual(report.committed_count, 1)
        self.assertTrue(self.engine.graph.facts())

    def test_duplicate_commit_is_idempotent(self) -> None:
        batch = self.quid.extract_knowledge("O leão é um animal.")
        first = self.quid.consolidate_knowledge(batch)
        second = self.quid.consolidate_knowledge(batch)

        self.assertEqual(first.committed_count, 1)
        self.assertEqual(second.committed_count, 0)
        self.assertEqual(len(self.engine.graph.facts()), 1)

    def test_conflict_group_is_not_committed(self) -> None:
        self.engine.learn("O leão é um animal.", source="memory")
        batch = self.quid.extract_knowledge("O leão não é um animal.")
        result = self.quid.consolidate_knowledge(batch)

        self.assertEqual(result.committed_count, 0)
        self.assertTrue(result.records[0].conflict)
        self.assertEqual(len(self.engine.graph.facts()), 1)

    def test_multiple_sources_are_preserved(self) -> None:
        a = self.quid.extract_knowledge("O leão é um animal.")
        b = self.quid.extract_knowledge("O leão é um animal.")

        ra = self.quid.consolidate_knowledge(a)
        rb = self.quid.consolidate_knowledge(b)

        self.assertEqual(ra.committed_count, 1)
        self.assertEqual(rb.committed_count, 0)
        self.assertEqual(len(self.engine.graph.facts()), 1)

    def test_quid_pipeline_mutates_only_at_consolidation(self) -> None:
        batch = self.quid.extract_knowledge("O lobo é um animal.")
        self.assertEqual(len(self.engine.graph.facts()), 0)
        self.quid.validate_knowledge(batch)
        self.quid.deduplicate_knowledge(batch)
        self.assertEqual(len(self.engine.graph.facts()), 0)
        self.quid.consolidate_knowledge(batch)
        self.assertEqual(len(self.engine.graph.facts()), 1)


if __name__ == "__main__":
    unittest.main()

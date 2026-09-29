import os
import tempfile
import unittest

from griot_consolidation import KnowledgeConsolidator
from griot_deduplication import SemanticDeduplicator
from griot_demotion import KnowledgeDemotionEngine
from griot_engine import Fact, GRIOT
from griot_promotion import KnowledgeLevel, KnowledgePromotionEngine, PromotionPolicy
from griot_semantic_ir import SemanticGRIOT
from griot_storage import SQLiteKnowledgeStore
from griot_validation import KnowledgeValidator, ValidationStatus
from quid_core import Quid


class ContradictionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.quid = Quid(self.engine)

    def test_reasoning_conflict_abstains(self) -> None:
        self.engine.learn("O leão é um animal.", source="a")
        self.engine.learn("O leão não é um animal.", source="b")
        result = self.quid.analisar("leão é um animal")
        self.assertEqual(result.reasoning.status.value, "conflict")
        self.assertIsNone(result.answer)
        self.assertTrue(result.abstained)
        self.assertTrue(result.verification.ok)

    def test_validation_marks_opposite_polarity_as_conflict(self) -> None:
        self.engine.learn("O leão é um animal.", source="a")
        batch = self.quid.extract_knowledge("O leão não é um animal.", source="b")
        report = self.quid.validate_knowledge(batch)
        self.assertEqual(report.candidates[0].status, ValidationStatus.CONFLICT)
        self.assertFalse(report.can_commit)

    def test_deduplication_keeps_conflict_group(self) -> None:
        lion = self.engine.quids.get("leão").symbol
        animal = self.engine.quids.get("animal").symbol
        candidates = self.quid.extract_knowledge("O leão é um animal.")
        positive = candidates.candidates[0]
        negative_fact = Fact(
            lion,
            positive.fact.relation,
            animal,
            positive.fact.confidence,
            True,
            "negative",
        )
        from griot_extraction import ExtractionCandidate
        negative = ExtractionCandidate(
            negative_fact,
            "O leão não é um animal.",
            candidates.gir.fingerprint(),
            positive.extraction_confidence,
        )
        report = SemanticDeduplicator().deduplicate((positive, negative))
        self.assertEqual(len(report.groups), 1)
        self.assertTrue(report.groups[0].contradictory)
        self.assertEqual(len(report.conflict_groups), 1)

    def test_consolidation_never_commits_conflicting_group(self) -> None:
        lion = self.engine.quids.get("leão").symbol
        animal = self.engine.quids.get("animal").symbol
        self.engine.graph.add_fact(Fact(lion, "is_a", animal, 0.9, False, "a"))

        batch = self.quid.extract_knowledge("O leão não é um animal.", source="b")
        validation = KnowledgeValidator(self.engine).validate(batch)
        dedup = SemanticDeduplicator().deduplicate(
            item.candidate for item in validation.valid
        )
        report = KnowledgeConsolidator(self.engine).consolidate(validation, dedup)

        self.assertEqual(report.committed_count, 0)
        self.assertEqual(len(self.engine.graph.facts()), 1)

    def test_promotion_is_demoted_by_conflict(self) -> None:
        lion = self.engine.quids.get("leão").symbol
        animal = self.engine.quids.get("animal").symbol
        positive = (
            Fact(lion, "is_a", animal, 0.95, False, "a"),
            Fact(lion, "is_a", animal, 0.95, False, "b"),
        )
        negative = Fact(lion, "is_a", animal, 0.95, True, "c")

        promotion = KnowledgePromotionEngine(PromotionPolicy(min_sources=2, min_confidence=0.9))
        promotion.assess(positive)
        self.assertEqual(promotion.level(positive[0]), KnowledgeLevel.PROMOTED)

        demotion = KnowledgeDemotionEngine(self.engine, promotion)
        result = demotion.reconcile((*positive, negative))
        self.assertEqual(len(result), 2)
        self.assertTrue(all(item.level == KnowledgeLevel.DEMOTED for item in result))

    def test_storage_preserves_both_polarities(self) -> None:
        lion = self.engine.quids.get("leão").symbol
        animal = self.engine.quids.get("animal").symbol
        facts = (
            Fact(lion, "is_a", animal, 0.9, False, "a"),
            Fact(lion, "is_a", animal, 0.9, True, "b"),
        )
        with SQLiteKnowledgeStore() as store:
            store.put_fact(facts[0])
            store.put_fact(facts[1])
            restored = store.query_facts(
                subject=lion,
                relation="is_a",
                object_=animal,
            )
            self.assertEqual(len(restored), 2)
            self.assertEqual({fact.negated for fact in restored}, {False, True})

    def test_conflict_survives_disk_round_trip(self) -> None:
        self.engine.learn("O leão é um animal.", source="a")
        self.engine.learn("O leão não é um animal.", source="b")
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "conflict.sqlite")
            with SQLiteKnowledgeStore(path) as store:
                store.put_engine(self.engine)
            restored = Quid.from_storage(path)
            result = restored.analisar("leão é um animal")
            self.assertEqual(result.reasoning.status.value, "conflict")
            self.assertIsNone(result.answer)


if __name__ == "__main__":
    unittest.main()

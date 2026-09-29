import unittest

from griot_engine import Fact, GRIOT
from griot_promotion import KnowledgeLevel, KnowledgePromotionEngine, PromotionPolicy
from griot_demotion import KnowledgeDemotionEngine
from quid_core import Quid


class DemotionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.promotion = KnowledgePromotionEngine(PromotionPolicy(min_sources=2, min_confidence=0.8))
        self.demotion = KnowledgeDemotionEngine(self.engine, self.promotion)
        self.quid = Quid(self.engine)

    def _facts(self):
        lion = self.engine.quids.get("leão").symbol
        animal = self.engine.quids.get("animal").symbol
        return (
            Fact(lion, "is_a", animal, 0.9, False, "a"),
            Fact(lion, "is_a", animal, 0.9, False, "b"),
        )

    def test_promoted_fact_is_not_demoted_when_evidence_remains_stable(self) -> None:
        facts = self._facts()
        self.promotion.assess(facts)
        result = self.demotion.reconcile(facts)
        self.assertEqual(result[0].level, KnowledgeLevel.PROMOTED)
        self.assertEqual(result[0].reason, "stable")

    def test_contradiction_demotes_both_polarities(self) -> None:
        facts = self._facts()
        self.promotion.assess(facts)
        negative = Fact(facts[0].subject, facts[0].relation, facts[0].object, 0.9, True, "c")
        self.promotion.assess((*facts, negative))
        result = self.demotion.reconcile((*facts, negative))

        self.assertEqual(len(result), 2)
        self.assertTrue(all(item.level == KnowledgeLevel.DEMOTED for item in result))
        self.assertTrue(all(item.reason == "contradictory-polarity-evidence" for item in result))

    def test_confidence_decay_demotes_promoted_fact(self) -> None:
        facts = self._facts()
        self.promotion.assess(facts)
        decayed = tuple(
            Fact(f.subject, f.relation, f.object, 0.5, f.negated, f.provenance)
            for f in facts
        )
        result = self.demotion.reconcile(decayed)
        self.assertEqual(result[0].level, KnowledgeLevel.DEMOTED)
        self.assertEqual(result[0].reason, "confidence-decay")

    def test_quid_reconcile_exposes_demotions(self) -> None:
        facts = self._facts()
        self.engine.graph.add_fact(facts[0])
        self.engine.graph.add_fact(facts[1])
        self.quid.assess_knowledge()
        self.engine.graph.add_fact(
            Fact(facts[0].subject, facts[0].relation, facts[0].object, 0.9, True, "c")
        )
        self.quid.assess_knowledge()
        result = self.quid.reconcile_knowledge()
        self.assertTrue(result)
        self.assertTrue(all(item.level == KnowledgeLevel.DEMOTED for item in result))


if __name__ == "__main__":
    unittest.main()

import unittest

from griot_engine import Fact, GRIOT
from griot_promotion import KnowledgeLevel, KnowledgePromotionEngine, PromotionPolicy
from quid_core import Quid


class PromotionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.quid = Quid(self.engine)
        self.promotion = KnowledgePromotionEngine(PromotionPolicy(min_sources=2, min_confidence=0.8))

    def _fact(self, source: str, confidence: float = 0.9) -> Fact:
        lion = self.engine.quids.ensure("leão", family_id=1).symbol
        animal = self.engine.quids.ensure("animal", family_id=1).symbol
        return Fact(lion, "is_a", animal, confidence, False, source)

    def test_single_source_stays_candidate(self) -> None:
        result = self.promotion.assess((self._fact("a"),))
        self.assertEqual(result[0].level, KnowledgeLevel.CANDIDATE)

    def test_two_distinct_sources_promote(self) -> None:
        result = self.promotion.assess((
            self._fact("a"),
            self._fact("b"),
        ))
        self.assertEqual(result[0].level, KnowledgeLevel.PROMOTED)
        self.assertEqual(result[0].source_count, 2)

    def test_low_confidence_stays_candidate(self) -> None:
        result = self.promotion.assess((
            self._fact("a", 0.5),
            self._fact("b", 0.6),
        ))
        self.assertEqual(result[0].level, KnowledgeLevel.CANDIDATE)

    def test_promotion_is_sticky_until_explicit_demotion(self) -> None:
        fact_a = self._fact("a")
        fact_b = self._fact("b")
        self.promotion.assess((fact_a, fact_b))
        self.assertEqual(self.promotion.level(fact_a), KnowledgeLevel.PROMOTED)

        self.promotion.assess((fact_a,))
        self.assertEqual(self.promotion.level(fact_a), KnowledgeLevel.PROMOTED)

    def test_quid_assessment_promotes_multi_source_memory(self) -> None:
        self.engine.learn("O leão é um animal.", source="a")
        self.engine.learn("O leão é um animal.", source="b")
        assessment = self.quid.assess_knowledge()
        target = next(
            item for item in assessment
            if item.key[0] == self.engine.quids.get("leão").symbol
        )
        self.assertEqual(target.level, KnowledgeLevel.PROMOTED)


if __name__ == "__main__":
    unittest.main()

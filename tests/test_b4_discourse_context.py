import unittest

from griot_discourse import DiscourseContextEngine, DiscourseRelation
from griot_semantic_ir import SemanticGRIOT
from griot_engine import GRIOT
from quid_core import Quid


class DiscourseContextTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.semantic = SemanticGRIOT(self.engine)
        self.discourse = self.engine.discourse

    def test_first_turn_has_no_previous_relation(self) -> None:
        gir = self.semantic.understand("O leão é um animal.")
        state = self.discourse.observe("O leão é um animal.", gir)
        self.assertEqual(state.turn, 1)
        self.assertEqual(state.transition.relation, DiscourseRelation.NONE)
        self.assertEqual(state.active_segment_id, 1)

    def test_shared_topic_is_continuation(self) -> None:
        first = self.semantic.understand("O leão é um animal.")
        self.engine.context.ingest(first, source="first")
        second = self.semantic.understand("O leão é um mamífero.")
        state = self.discourse.observe(
            "O leão é um mamífero.",
            second,
            previous_records=self.engine.context.records(),
        )
        self.assertEqual(state.transition.relation, DiscourseRelation.CONTINUATION)
        self.assertIn("🦁", state.transition.shared_quids)
        self.assertEqual(state.active_segment_id, 1)

    def test_marker_creates_explicit_contrast(self) -> None:
        first = self.semantic.understand("O leão é um animal.")
        self.engine.context.ingest(first, source="first")
        second = self.semantic.understand("Mas o lobo é um animal.")
        state = self.discourse.observe(
            "Mas o lobo é um animal.",
            second,
            previous_records=self.engine.context.records(),
        )
        self.assertEqual(state.transition.relation, DiscourseRelation.CONTRAST)
        self.assertIn("mas", state.transition.markers)

    def test_low_overlap_creates_topic_shift(self) -> None:
        first = self.semantic.understand("O leão é um animal.")
        self.engine.context.ingest(first, source="first")
        second = self.semantic.understand("A árvore é uma planta.")
        state = self.discourse.observe(
            "A árvore é uma planta.",
            second,
            previous_records=self.engine.context.records(),
        )
        self.assertEqual(state.transition.relation, DiscourseRelation.TOPIC_SHIFT)
        self.assertEqual(state.active_segment_id, 2)

    def test_state_is_deterministic(self) -> None:
        first = self.semantic.understand("O leão é um animal.")
        self.engine.context.ingest(first, source="first")
        second = self.semantic.understand("O leão é um mamífero.")

        a = DiscourseContextEngine()
        b = DiscourseContextEngine()
        self.assertEqual(
            a.observe("O leão é um animal.", first, previous_records=()).transition,
            b.observe("O leão é um animal.", first, previous_records=()).transition,
        )
        self.assertEqual(
            a.observe("O leão é um mamífero.", second, previous_records=(self.engine.context.records()[-1],)).transition,
            b.observe("O leão é um mamífero.", second, previous_records=(self.engine.context.records()[-1],)).transition,
        )

    def test_quid_analysis_exposes_discourse_state(self) -> None:
        quid = Quid(self.engine)
        first = quid.analisar("leão é um animal")
        second = quid.analisar("leão é um mamífero")

        self.assertEqual(first.discourse.turn, 1)
        self.assertEqual(second.discourse.turn, 2)
        self.assertEqual(second.discourse.active_segment_id, 1)
        self.assertEqual(second.discourse.transition.relation, DiscourseRelation.CONTINUATION)


if __name__ == "__main__":
    unittest.main()

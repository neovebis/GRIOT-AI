import unittest

from griot_context import ContextEngine
from griot_engine import GRIOT
from quid_core import Quid


class ContextEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.semantic = Quid(self.engine).semantic
        self.context = self.engine.context

    def test_context_is_centralized_on_engine(self) -> None:
        self.assertIsInstance(self.context, ContextEngine)
        self.assertEqual(self.context.turn, 0)
        self.assertEqual(len(self.context), 0)
        self.assertEqual(self.engine.state()["context"]["records"], 0)

    def test_ingest_records_validated_gir_without_touching_graph(self) -> None:
        gir = self.semantic.understand("O leão é um animal.")
        before = len(self.engine.graph.facts())
        record = self.context.ingest(gir, source="turn:1")
        self.assertEqual(record.turn, 1)
        self.assertIn("🦁", record.quids)
        self.assertEqual(len(record.quids), 2)
        self.assertEqual(len(self.engine.graph.facts()), before)
        self.assertEqual(self.context.get(record.record_id), record)

    def test_query_context_prefers_shared_quid_and_relation(self) -> None:
        first = self.semantic.understand("O leão é um animal.")
        second = self.semantic.understand("O lobo é um animal.")
        query = self.semantic.understand("O leão é um mamífero.")
        self.context.ingest(first, source="first")
        self.context.ingest(second, source="second")

        view = self.context.view(query, limit=2)

        self.assertEqual(view.turn, 2)
        self.assertEqual(view.matches[0].record_id, 1)
        self.assertIn("🦁", view.matches[0].shared_quids)
        self.assertIn("is_a", view.matches[0].shared_relations)
        self.assertIn("🦁", view.active_quids)
        self.assertEqual(view.topic_quids[0], "🐺")

    def test_context_is_bounded_and_evicts_old_records(self) -> None:
        bounded = ContextEngine(max_records=2)
        for text in ("O leão é um animal.", "O lobo é um animal.", "A árvore é uma planta."):
            bounded.ingest(self.semantic.understand(text))
        self.assertEqual(len(bounded), 2)
        self.assertIsNone(bounded.get(1))
        self.assertEqual([record.record_id for record in bounded.records()], [2, 3])

    def test_active_quids_are_ranked_by_recency_and_weight(self) -> None:
        self.context.ingest(self.semantic.understand("O leão é um animal."), source="first")
        self.context.ingest(self.semantic.understand("O lobo é um animal."), source="second")
        self.context.ingest(self.semantic.understand("O leão é um mamífero."), source="third")

        active = self.context.active_quids(8)
        self.assertLess(active.index("🦁"), active.index("🐺"))

    def test_clear_resets_transient_context(self) -> None:
        self.context.ingest(self.semantic.understand("O leão é um animal."))
        self.context.clear()
        self.assertEqual(self.context.turn, 0)
        self.assertEqual(len(self.context), 0)
        self.assertEqual(self.context.active_quids(), ())

    def test_quid_analysis_uses_prior_context_but_reasoning_stays_graph_grounded(self) -> None:
        quid = Quid(self.engine)
        first = quid.analisar("leão é um animal")
        self.assertEqual(len(first.context.matches), 0)

        self.engine.learn("O leão é um animal.", source="memory")
        second = quid.analisar("leão é um animal")

        self.assertTrue(second.answer)
        self.assertTrue(second.context.matches)
        self.assertEqual(second.context.matches[0].record_id, 1)
        self.assertIn("🦁", second.context.matches[0].shared_quids)
        self.assertEqual(self.context.turn, 2)


if __name__ == "__main__":
    unittest.main()

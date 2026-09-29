import unittest

from griot_engine import Fact, GRIOT
from griot_working_graph import WorkingGraph


class WorkingGraphTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.semantic = __import__("griot_semantic_ir").griot_semantic_ir.SemanticGRIOT(self.engine)

    def test_build_is_transient_and_does_not_mutate_durable_graph(self) -> None:
        self.engine.learn("O leão é um animal.", source="memory")
        gir = self.semantic.understand("leão é um animal")
        before = set(self.engine.graph.facts())

        working = WorkingGraph(max_evidence=32)
        state = working.build(gir, durable_graph=self.engine.graph)

        self.assertEqual(set(self.engine.graph.facts()), before)
        self.assertGreaterEqual(state.evidence_count, 1)
        self.assertIn("🦁", state.quids)

    def test_current_gir_and_durable_evidence_are_present(self) -> None:
        self.engine.learn("O leão é um animal.", source="memory")
        gir = self.semantic.understand("leão é um animal")
        working = WorkingGraph()
        working.build(gir, durable_graph=self.engine.graph)

        matches = working.query(subject="🦁", relation="is_a")
        self.assertTrue(matches)
        self.assertTrue(any(entry.origin == "current-gir" for entry in matches))
        self.assertTrue(any(entry.origin == "durable-direct" for entry in matches))

    def test_multiple_sources_survive_working_graph_deduplication(self) -> None:
        self.engine.learn("O leão é um animal.", source="source-a")
        self.engine.learn("O leão é um animal.", source="source-b")
        gir = self.semantic.understand("leão é um animal")
        working = WorkingGraph()
        working.build(gir, durable_graph=self.engine.graph)

        durable = working.query(subject="🦁", relation="is_a", object_="animal")
        self.assertGreaterEqual(len(durable), 2)

    def test_context_evidence_is_selected_by_context_view(self) -> None:
        self.engine.context.ingest(self.semantic.understand("O leão é um animal."), source="prior")
        query = self.semantic.understand("leão é um mamífero")
        view = self.engine.context.view(query)

        working = WorkingGraph()
        state = working.build(query, context=view, context_engine=self.engine.context)
        self.assertTrue(state.evidence_count)
        self.assertTrue(any(entry.origin.startswith("context:") for entry in working.evidence()))

    def test_working_graph_is_bounded(self) -> None:
        working = WorkingGraph(max_evidence=2)
        facts = [
            Fact("🦁", "is_a", "🐺", 1.0, False, f"s{i}") for i in range(4)
        ]
        working.extend(facts, origin="test")
        self.assertEqual(len(working), 2)

    def test_analysis_exposes_working_graph_state(self) -> None:
        self.engine.learn("O leão é um animal.", source="memory")
        analysis = __import__("quid_core").quid_core.Quid(self.engine).analisar("leão é um animal")
        self.assertGreaterEqual(analysis.working_graph.evidence_count, 1)
        self.assertIn("🦁", analysis.working_graph.quids)
        self.assertIn("memory", analysis.working_graph.sources)


if __name__ == "__main__":
    unittest.main()

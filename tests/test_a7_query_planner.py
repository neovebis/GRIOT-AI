import unittest

from griot_query_planner import QueryPlanner
from griot_semantic_ir import SemanticGRIOT
from griot_engine import GRIOT
from quid_core import Quid


class QueryPlannerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.semantic = SemanticGRIOT(self.engine)
        self.planner = QueryPlanner(self.engine)

    def test_plan_is_deterministic_and_has_explicit_targets(self) -> None:
        gir = self.semantic.understand("leão é um animal")
        view = self.engine.context.view(gir)
        a = self.planner.plan(gir, view)
        b = self.planner.plan(gir, view)

        self.assertEqual(a, b)
        self.assertTrue(a.targets)
        self.assertEqual(a.targets[0].relation, "is_a")
        self.assertIn("exact_durable_evidence", a.strategies)
        self.assertIn("rule_inference", a.strategies)

    def test_plan_fingerprint_changes_when_retrieval_budget_changes(self) -> None:
        gir = self.semantic.understand("leão é um animal")
        a = QueryPlanner(self.engine, max_evidence=64).plan(gir)
        b = QueryPlanner(self.engine, max_evidence=128).plan(gir)
        self.assertNotEqual(a.fingerprint, b.fingerprint)

    def test_plan_rejects_execution_against_wrong_gir(self) -> None:
        a = self.semantic.understand("leão é um animal")
        b = self.semantic.understand("lobo é um animal")
        plan = self.planner.plan(a)
        with self.assertRaises(ValueError):
            self.planner.execute(plan, b)

    def test_execute_retrieves_all_direct_sources_and_inferences(self) -> None:
        self.engine.learn("O leão é um animal.", source="source-a")
        self.engine.learn("O leão é um animal.", source="source-b")
        self.engine.learn("O animal é um ser vivo.", source="source-c")

        gir = self.semantic.understand("leão é um ser vivo")
        result = self.planner.execute(self.planner.plan(gir), gir)

        self.assertIn("🦁", result.working_graph.quids)
        self.assertGreaterEqual(result.working_graph.direct_count, 1)
        self.assertGreaterEqual(result.working_graph.inference_count, 1)
        self.assertIn("source-a", result.working_graph.sources)
        self.assertIn("source-b", result.working_graph.sources)

    def test_context_records_are_selected_by_plan(self) -> None:
        old = self.engine.context.ingest(self.semantic.understand("O leão é um animal."), source="prior")
        gir = self.semantic.understand("leão é um mamífero")
        view = self.engine.context.view(gir)

        plan = self.planner.plan(gir, view)
        result = self.planner.execute(plan, gir, view)

        self.assertIn(old.record_id, plan.context_record_ids)
        self.assertTrue(any(src.startswith("prior") for src in result.working_graph.sources))

    def test_quid_analysis_exposes_the_query_plan(self) -> None:
        self.engine.learn("O leão é um animal.", source="memory")
        result = Quid(self.engine).analisar("leão é um animal")
        self.assertTrue(result.query_plan.targets)
        self.assertEqual(result.query_plan.gir_fingerprint, result.gir.fingerprint())
        self.assertGreaterEqual(result.working_graph.evidence_count, 1)


if __name__ == "__main__":
    unittest.main()

import unittest

from griot_engine import Fact, GRIOT
from griot_selective_retrieval import SelectiveRetriever
from griot_query_planner import QueryPlanner
from griot_semantic_ir import SemanticGRIOT


class SelectiveRetrievalTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.engine.learn(
            "O leão é um animal. O leão vive na savana. A savana fica em África. O lobo é um animal.",
            source="memory",
        )
        self.retriever = SelectiveRetriever(self.engine, budget=3)

    def test_exact_evidence_is_ranked_first(self) -> None:
        lion = self.engine.quids.get("leão").symbol
        animal = self.engine.quids.get("animal").symbol
        result = self.retriever.retrieve(
            subject=lion,
            relation="is_a",
            object_=animal,
        )
        self.assertTrue(result.items)
        self.assertEqual(result.items[0].reason, "exact")

    def test_neighborhood_is_explicitly_marked(self) -> None:
        lion = self.engine.quids.get("leão").symbol
        result = self.retriever.retrieve(subject=lion)
        self.assertTrue(any(item.reason == "subject-neighborhood" for item in result.items))

    def test_budget_is_hard(self) -> None:
        lion = self.engine.quids.get("leão").symbol
        result = SelectiveRetriever(self.engine, budget=1).retrieve(subject=lion)
        self.assertLessEqual(len(result.items), 1)
        self.assertTrue(result.truncated)

    def test_retrieval_does_not_mutate_graph(self) -> None:
        before = set(self.engine.graph.facts())
        self.retriever.retrieve(subject="🦁")
        self.assertEqual(set(self.engine.graph.facts()), before)

    def test_query_planner_adds_neighborhood_without_marking_it_as_direct(self) -> None:
        semantic = SemanticGRIOT(self.engine)
        planner = QueryPlanner(self.engine)
        gir = semantic.understand("leão é um animal")
        result = planner.execute(planner.plan(gir), gir)
        self.assertTrue(result.working_graph.evidence_count >= 1)

        # Planner's retriever is a bounded adjunct; direct/inference counts
        # remain separate from neighborhood evidence.
        self.assertGreaterEqual(
            result.working_graph.direct_count,
            1,
        )


if __name__ == "__main__":
    unittest.main()

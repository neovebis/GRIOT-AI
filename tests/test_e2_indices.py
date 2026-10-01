import unittest

from griot_engine import Fact, GRIOT
from griot_indices import FactIndices
from griot_query_planner import QueryPlanner
from griot_semantic_ir import SemanticGRIOT


class IndexTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.engine.learn("O leão é um animal. O lobo é um animal.", source="memory")
        self.indices = FactIndices(self.engine.graph.facts())

    def test_exact_index_preserves_all_provenance(self) -> None:
        lion = self.engine.quids.get("leão").symbol
        animal = self.engine.quids.get("animal").symbol
        self.engine.graph.add_fact(Fact(lion, "is_a", animal, 0.8, False, "second"))
        self.indices.rebuild(self.engine.graph.facts())

        result = self.indices.exact(lion, "is_a", animal)
        self.assertEqual(len(result), 2)
        self.assertEqual({fact.provenance for fact in result}, {"memory", "second"})

    def test_subject_relation_query_uses_index(self) -> None:
        lion = self.engine.quids.get("leão").symbol
        result = self.indices.query(subject=lion, relation="is_a")
        self.assertEqual(len(result), 1)

    def test_object_relation_query_uses_index(self) -> None:
        animal = self.engine.quids.get("animal").symbol
        result = self.indices.query(object_=animal, relation="is_a")
        self.assertEqual(len(result), 2)

    def test_remove_updates_all_indexes(self) -> None:
        fact = next(iter(self.engine.graph.facts()))
        self.indices.remove(fact)
        self.assertNotIn(fact, self.indices.query())
        self.assertEqual(self.indices.stats().facts, len(self.engine.graph.facts()) - 1)

    def test_query_planner_refreshes_only_after_fact_count_changes(self) -> None:
        planner = QueryPlanner(self.engine)
        semantic = SemanticGRIOT(self.engine)
        gir = semantic.understand("leão é um animal")
        planner.execute(planner.plan(gir), gir)
        first_index_id = id(planner.indices)

        planner.execute(planner.plan(gir), gir)
        self.assertEqual(id(planner.indices), first_index_id)

        lion = self.engine.quids.get("leão").symbol
        animal = self.engine.quids.get("animal").symbol
        self.engine.graph.add_fact(Fact(lion, "is_a", animal, 0.7, False, "new"))
        planner.execute(planner.plan(gir), gir)
        self.assertEqual(planner.indices.stats().facts, len(self.engine.graph.facts()))

    def test_index_stats_are_consistent(self) -> None:
        stats = self.indices.stats()
        self.assertEqual(stats.facts, 2)
        self.assertEqual(stats.subjects, 2)
        self.assertEqual(stats.objects, 1)
        self.assertEqual(stats.relations, 1)
        self.assertEqual(stats.semantic_keys, 2)


if __name__ == "__main__":
    unittest.main()

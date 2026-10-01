import unittest

from griot_cache import GenerationCache
from griot_engine import Fact, GRIOT
from griot_query_planner import QueryPlanner
from griot_semantic_ir import SemanticGRIOT


class CacheTests(unittest.TestCase):
    def test_cache_hits_and_misses_are_tracked(self) -> None:
        cache = GenerationCache[int](capacity=2)
        self.assertIsNone(cache.get("x"))
        cache.put("x", 1)
        self.assertEqual(cache.get("x"), 1)
        stats = cache.stats()
        self.assertEqual(stats.hits, 1)
        self.assertEqual(stats.misses, 1)

    def test_lru_eviction_is_bounded(self) -> None:
        cache = GenerationCache[int](capacity=2)
        cache.put("a", 1)
        cache.put("b", 2)
        cache.get("a")
        cache.put("c", 3)

        self.assertEqual(cache.get("a"), 1)
        self.assertIsNone(cache.get("b"))
        self.assertEqual(cache.get("c"), 3)
        self.assertEqual(cache.stats().evictions, 1)

    def test_invalidation_changes_generation_and_clears_data(self) -> None:
        cache = GenerationCache[int](capacity=2)
        cache.put("x", 1)
        old_generation = cache.generation
        cache.invalidate()
        self.assertEqual(cache.generation, old_generation + 1)
        self.assertIsNone(cache.get("x"))

    def test_query_planner_caches_exact_evidence(self) -> None:
        engine = GRIOT.create()
        engine.learn("O leão é um animal.", source="memory")
        semantic = SemanticGRIOT(engine)
        planner = QueryPlanner(engine)
        gir = semantic.understand("leão é um animal")

        planner.execute(planner.plan(gir), gir)
        planner.execute(planner.plan(gir), gir)

        self.assertGreaterEqual(planner.cache.stats().hits, 1)

    def test_new_fact_invalidates_query_cache(self) -> None:
        engine = GRIOT.create()
        engine.learn("O leão é um animal.", source="memory")
        semantic = SemanticGRIOT(engine)
        planner = QueryPlanner(engine)
        gir = semantic.understand("leão é um animal")
        planner.execute(planner.plan(gir), gir)
        old_generation = planner.cache.generation

        lion = engine.quids.get("leão").symbol
        animal = engine.quids.get("animal").symbol
        engine.graph.add_fact(Fact(lion, "is_a", animal, 0.8, False, "second"))
        planner.execute(planner.plan(gir), gir)

        self.assertGreater(planner.cache.generation, old_generation)
        self.assertEqual(planner.indices.stats().facts, len(engine.graph.facts()))


if __name__ == "__main__":
    unittest.main()

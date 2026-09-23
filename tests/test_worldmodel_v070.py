import unittest

from griot.engine import GRIOT
from griot_worldmodel_v070 import WorldModel


class WorldModelV070Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT()
        self.engine.learn("A chuva causa chão molhado. O chão molhado causa lama.", source="causal")
        self.world = WorldModel(self.engine)

    def test_causal_chain_propagates_by_steps(self):
        trace = self.world.simulate(("chuva",), steps=4)
        labels = [set(self.world.labels(state)) for state in trace.states]
        self.assertIn("chuva", labels[0])
        self.assertIn("chão molhado", labels[1])
        self.assertIn("lama", labels[2])
        self.assertTrue(trace.events)

    def test_fixed_point_stops_early(self):
        trace = self.world.simulate(("chuva",), steps=20)
        self.assertLess(trace.terminal.step, 20)

    def test_counterfactual_changes_world_without_memory_mutation(self):
        baseline = self.world.simulate(("chuva",), steps=4)
        cf = self.world.counterfactual(("chuva",), remove=("chuva",), steps=4)
        self.assertIn("lama", self.world.labels(baseline.terminal))
        self.assertNotIn("lama", self.world.labels(cf.intervention.terminal))
        self.assertTrue(cf.changed)
        self.assertEqual(len(self.engine.graph.facts()), 2)

    def test_causal_plan_finds_prerequisite_chain(self):
        plan = self.world.plan("lama")
        self.assertEqual(plan.depth, 2)
        self.assertTrue(any(len(path) == 3 for path in plan.prerequisites))
        chuva = self.engine.quids.get("chuva")
        assert chuva is not None
        self.assertTrue(any(path[0] == chuva.symbol for path in plan.prerequisites))

    def test_unknown_entities_get_atomic_quids(self):
        trace = self.world.simulate(("algo desconhecido",), steps=1)
        self.assertTrue(trace.initial.active)
        self.assertTrue(all(len(symbol) == 1 for symbol in trace.initial.active))


if __name__ == "__main__":
    unittest.main()

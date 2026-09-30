import unittest

from griot_engine import GRIOT
from griot_planning_v080 import GoalPlanner
from griot_worldmodel_v070 import WorldModel
from quid_core import Quid


class PlanningTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.engine.learn(
            "O fogo causa calor. O calor causa comida quente.",
            source="world",
        )
        self.planner = GoalPlanner(self.engine)

    def test_world_model_propagates_causal_chain(self) -> None:
        world = WorldModel(self.engine)
        trace = world.simulate(("fogo",), steps=4)
        labels = [set(world.labels(state)) for state in trace.states]
        self.assertIn(self.engine.quids.get("fogo").label, labels[0])
        self.assertIn(self.engine.quids.get("calor").label, labels[1])
        self.assertIn(self.engine.quids.get("comida quente").label, labels[2])
        self.assertLessEqual(trace.terminal.step, 4)

    def test_world_model_does_not_mutate_memory(self) -> None:
        world = WorldModel(self.engine)
        before = len(self.engine.graph.facts())
        world.simulate(("fogo",), steps=4)
        self.assertEqual(before, len(self.engine.graph.facts()))

    def test_goal_planner_finds_one_action_with_causal_effects(self) -> None:
        self.planner.register_action(
            "acender fogo",
            preconditions=("madeira",),
            add_effects=("fogo",),
        )
        plan = self.planner.plan(("madeira",), "comida quente", max_depth=3)
        self.assertIsNotNone(plan)
        self.assertEqual([step.action.label for step in plan.steps], ["acender fogo"])
        self.assertTrue(plan.verified)
        self.assertIn("comida quente", self.planner.labels(plan.final))

    def test_goal_planner_handles_multi_action_plan(self) -> None:
        self.planner.register_action(
            "acender fogo",
            preconditions=("madeira",),
            add_effects=("fogo",),
        )
        self.planner.register_action(
            "cozinhar",
            preconditions=("fogo",),
            add_effects=("comida",),
            remove_effects=("fogo",),
            cost=2.0,
        )
        plan = self.planner.plan(("madeira",), "comida", max_depth=3)
        self.assertIsNotNone(plan)
        self.assertEqual(
            [step.action.label for step in plan.steps],
            ["acender fogo", "cozinhar"],
        )
        self.assertEqual(plan.total_cost, 3.0)
        self.assertTrue(plan.verified)

    def test_no_plan_returns_none(self) -> None:
        self.planner.register_action(
            "acender fogo",
            preconditions=("madeira",),
            add_effects=("fogo",),
        )
        self.assertIsNone(self.planner.plan(("pedra",), "comida quente", max_depth=2))

    def test_causal_prerequisite_plan_is_explicit(self) -> None:
        plan = WorldModel(self.engine).plan("comida quente")
        self.assertEqual(plan.depth, 2)
        self.assertTrue(plan.prerequisites)

    def test_quid_exposes_verified_goal_planning(self) -> None:
        quid = Quid(self.engine)
        quid.register_action(
            "acender fogo",
            preconditions=("madeira",),
            add_effects=("fogo",),
        )
        plan = quid.plan_goal(("madeira",), "comida quente", max_depth=3)
        self.assertIsNotNone(plan)
        self.assertTrue(plan.verified)


if __name__ == "__main__":
    unittest.main()

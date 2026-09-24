import unittest

from griot.engine import GRIOT
from griot_worldmodel_v070 import WorldModel
from griot_planning_v080 import GoalPlanner


class GoalPlannerV080Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT()
        self.engine.learn("O fogo causa calor. O calor causa comida quente.", source="world")
        self.planner = GoalPlanner(self.engine)

    def test_action_quid_is_atomic(self):
        action = self.planner.register_action(
            "acender fogo",
            preconditions=("madeira",),
            add_effects=("fogo",),
        )
        self.assertEqual(len(action.action_quid), 1)

    def test_planner_reaches_goal_through_causal_world(self):
        self.planner.register_action(
            "acender fogo",
            preconditions=("madeira",),
            add_effects=("fogo",),
        )
        plan = self.planner.plan(("madeira",), "comida quente", max_depth=3)
        self.assertIsNotNone(plan)
        assert plan is not None
        self.assertEqual(len(plan.steps), 1)
        self.assertTrue(plan.verified)
        self.assertIn("comida quente", self.planner.labels(plan.final))

    def test_multi_action_goal(self):
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
        )
        plan = self.planner.plan(("madeira",), ("comida",), max_depth=3)
        self.assertIsNotNone(plan)
        assert plan is not None
        self.assertEqual([s.action.label for s in plan.steps], ["acender fogo", "cozinhar"])
        self.assertTrue(plan.verified)

    def test_no_plan_returns_none(self):
        self.planner.register_action("acender fogo", preconditions=("madeira",), add_effects=("fogo",))
        self.assertIsNone(self.planner.plan(("pedra",), "comida quente", max_depth=2))

    def test_planning_does_not_mutate_memory(self):
        self.planner.register_action("acender fogo", preconditions=("madeira",), add_effects=("fogo",))
        before = len(self.engine.graph.facts())
        self.planner.plan(("madeira",), "comida quente", max_depth=3)
        self.assertEqual(before, len(self.engine.graph.facts()))


if __name__ == "__main__":
    unittest.main()

import unittest

from griot_engine import GRIOT, TransitionRule
from griot_simulation import SimulationEngine
from quid_core import Quid


class SimulationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.sim = SimulationEngine(self.engine)
        self.quid = Quid(self.engine)

    def test_deterministic_rule_simulation_is_reproducible(self) -> None:
        rules = (
            TransitionRule(
                "grow",
                lambda state: state["x"] < 3,
                lambda state: state.__setitem__("x", state["x"] + 1),
            ),
        )
        a = self.sim.run({"x": 0}, rules, steps=10)
        b = self.sim.run({"x": 0}, rules, steps=10)

        self.assertEqual(a, b)
        self.assertEqual(a.terminal_map["x"], 3.0)
        self.assertEqual(a.steps_executed, 4)
        self.assertEqual(a.rule_counts, (("grow", 3),))

    def test_simulation_does_not_mutate_initial_mapping(self) -> None:
        initial = {"x": 0}
        rules = (
            TransitionRule(
                "grow",
                lambda state: state["x"] < 2,
                lambda state: state.__setitem__("x", state["x"] + 1),
            ),
        )
        result = self.sim.run(initial, rules, steps=5)
        self.assertEqual(initial, {"x": 0})
        self.assertEqual(result.initial, (("x", 0.0),))

    def test_simulation_stops_when_no_rule_progresses(self) -> None:
        rules = (
            TransitionRule("never", lambda state: False, lambda state: None),
        )
        result = self.sim.run({"x": 1}, rules, steps=10)
        self.assertEqual(result.steps_executed, 1)
        self.assertEqual(result.terminal_map["x"], 1.0)

    def test_max_steps_are_enforced(self) -> None:
        rules = (
            TransitionRule(
                "grow",
                lambda state: True,
                lambda state: state.__setitem__("x", state["x"] + 1),
            ),
        )
        result = self.sim.run({"x": 0}, rules, steps=3)
        self.assertEqual(result.steps_executed, 3)
        self.assertEqual(result.terminal_map["x"], 3.0)

    def test_monte_carlo_is_reproducible_by_seed(self) -> None:
        def transition(state, rng):
            state["x"] += 1 if rng.random() >= 0.5 else 0

        a = self.sim.monte_carlo({"x": 0}, transition, steps=20, runs=100, seed=42)
        b = self.sim.monte_carlo({"x": 0}, transition, steps=20, runs=100, seed=42)

        self.assertEqual(a, b)
        self.assertEqual(a.runs, 100)
        self.assertEqual(a.steps, 20)
        self.assertEqual(a.seed, 42)

    def test_different_seeds_can_change_monte_carlo_statistics(self) -> None:
        def transition(state, rng):
            state["x"] += 1 if rng.random() >= 0.5 else 0

        a = self.sim.monte_carlo({"x": 0}, transition, steps=10, runs=50, seed=1)
        b = self.sim.monte_carlo({"x": 0}, transition, steps=10, runs=50, seed=2)
        self.assertNotEqual((a.mean, a.variance), (b.mean, b.variance))

    def test_invalid_simulation_parameters_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            self.sim.run({"x": 0}, (), steps=-1)
        with self.assertRaises(ValueError):
            self.sim.monte_carlo({"x": 0}, lambda state, rng: None, steps=1, runs=0)

    def test_quid_exposes_simulation_without_making_text_simulation_factual(self) -> None:
        rules = (
            TransitionRule(
                "grow",
                lambda state: state["x"] < 2,
                lambda state: state.__setitem__("x", state["x"] + 1),
            ),
        )
        result = self.quid.simulate({"x": 0}, rules, steps=4)
        self.assertEqual(result.terminal_map["x"], 2.0)

        analysis = self.quid.analisar("Simula o que acontece se o leão fugir.")
        self.assertIsNone(analysis.answer)
        self.assertEqual(analysis.intent.primary.value, "simulation")


if __name__ == "__main__":
    unittest.main()

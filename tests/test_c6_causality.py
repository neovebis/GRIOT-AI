import unittest

from griot_causality import CausalityEngine
from griot_engine import GRIOT
from quid_core import Quid


class CausalityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.engine.learn(
            "A chuva causa chão molhado. O chão molhado causa lama. A lama causa inundação.",
            source="causal-a",
        )
        self.causal = CausalityEngine(self.engine)
        self.quid = Quid(self.engine)

    def test_causes_of_returns_explicit_chain(self) -> None:
        analysis = self.causal.causes_of("inundação", max_depth=4)
        self.assertEqual(analysis.direct[0].subject, self.engine.quids.get("lama").symbol)
        self.assertTrue(any(path.depth == 3 for path in analysis.paths))

    def test_effects_of_returns_forward_chain(self) -> None:
        analysis = self.causal.effects_of("chuva", max_depth=4)
        target = self.engine.quids.get("inundação").symbol
        self.assertTrue(any(path.nodes[-1] == target for path in analysis.paths))

    def test_path_confidence_decreases_with_depth(self) -> None:
        analysis = self.causal.effects_of("chuva", max_depth=4)
        depths = {path.depth: path.confidence for path in analysis.paths}
        self.assertGreater(depths[1], depths[3])

    def test_reachable_is_directional_and_bounded(self) -> None:
        self.assertTrue(self.causal.reachable("chuva", "lama", max_depth=3))
        self.assertFalse(self.causal.reachable("lama", "chuva", max_depth=3))
        self.assertFalse(self.causal.reachable("chuva", "inundação", max_depth=1))

    def test_cycles_are_explicit(self) -> None:
        self.engine.learn("A inundação causa chuva.", source="cycle")
        analysis = self.causal.effects_of("chuva", max_depth=5)
        self.assertTrue(analysis.cycles)

    def test_causal_analysis_does_not_mutate_graph(self) -> None:
        before = set(self.engine.graph.facts())
        self.causal.causes_of("lama")
        self.assertEqual(set(self.engine.graph.facts()), before)

    def test_quid_exposes_causal_analysis(self) -> None:
        analysis = self.quid.causes_of("lama")
        self.assertTrue(analysis.direct)
        self.assertTrue(analysis.paths)


if __name__ == "__main__":
    unittest.main()

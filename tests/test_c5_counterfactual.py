import unittest

from griot_counterfactual import CounterfactualEngine
from griot_engine import GRIOT
from griot_reasoning_v040 import TruthStatus
from quid_core import Quid


class CounterfactualTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.engine.learn("O leão é um animal.", source="memory")
        self.cf = CounterfactualEngine(self.engine)

    def test_negative_intervention_changes_supported_query_to_refuted(self) -> None:
        result = self.cf.run(
            "O leão não é um animal.",
            "leão é um animal",
        )
        self.assertEqual(result.before.status, TruthStatus.SUPPORTED)
        self.assertEqual(result.after.status, TruthStatus.REFUTED)
        self.assertTrue(result.changed)
        self.assertTrue(result.removed_facts)

    def test_source_memory_is_unchanged(self) -> None:
        before = set(self.engine.graph.facts())
        quid_count = len(self.engine.quids.all())
        self.cf.run("O leão não é um animal.", "leão é um animal")
        self.assertEqual(set(self.engine.graph.facts()), before)
        self.assertEqual(len(self.engine.quids.all()), quid_count)

    def test_positive_intervention_replaces_negative_fact(self) -> None:
        negative_engine = GRIOT.create()
        negative_engine.learn("O leão não é um animal.", source="memory")
        cf = CounterfactualEngine(negative_engine)

        result = cf.run("O leão é um animal.", "leão é um animal")
        self.assertEqual(result.before.status, TruthStatus.REFUTED)
        self.assertEqual(result.after.status, TruthStatus.SUPPORTED)
        self.assertTrue(result.changed)

    def test_same_intervention_can_leave_status_unchanged(self) -> None:
        result = self.cf.run(
            "O leão não é um animal.",
            "o leão é uma galáxia",
        )
        self.assertEqual(result.before.status, TruthStatus.UNKNOWN)
        self.assertEqual(result.after.status, TruthStatus.UNKNOWN)
        self.assertFalse(result.changed)

    def test_counterfactual_keeps_assumption_provisional(self) -> None:
        result = self.cf.run(
            "O leão não é um animal.",
            "leão é um animal",
        )
        self.assertEqual(result.assumption.provenance, "semantic-compiler")

    def test_quid_exposes_counterfactual_api(self) -> None:
        result = Quid(self.engine).run_counterfactual(
            "O leão não é um animal.",
            "leão é um animal",
        )
        self.assertEqual(result.after.status, TruthStatus.REFUTED)
        self.assertTrue(result.changed)


if __name__ == "__main__":
    unittest.main()

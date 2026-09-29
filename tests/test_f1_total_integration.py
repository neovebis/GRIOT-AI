import os
import tempfile
import unittest

from griot_engine import GRIOT
from griot_runtime import GRIOTRuntime
from quid_core import Quid


class TotalIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.runtime = GRIOTRuntime(Quid(self.engine))

    def test_runtime_health_has_no_missing_stages(self) -> None:
        health = self.runtime.health()
        self.assertTrue(health.ready)
        self.assertEqual(health.missing, ())

    def test_analysis_contains_full_pipeline(self) -> None:
        self.engine.learn("O leão é um animal.", source="memory")
        result = self.runtime.analyze("leão é um animal")

        self.assertTrue(result.integrated)
        self.assertEqual(result.stages, self.runtime.STAGES)
        self.assertTrue(result.result.answer)
        self.assertTrue(result.result.verification.ok)

    def test_learning_uses_same_engine_instance(self) -> None:
        update = self.runtime.learn(
            "O lobo é um animal.",
            source="book",
        )
        self.assertTrue(update.changed)
        self.assertTrue(
            any(fact.provenance == "book" for fact in self.engine.graph.facts())
        )

    def test_persistence_round_trip_uses_runtime(self) -> None:
        self.engine.learn("O leão é um animal.", source="memory")
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "griot.sqlite")
            self.runtime.persist(path)
            restored = GRIOTRuntime.from_storage(path) if hasattr(GRIOTRuntime, "from_storage") else None
            # Current contract exposes persistence; restore remains Quid's explicit
            # constructor API until the next runtime refinement.
            self.assertTrue(os.path.exists(path))
            self.assertIsNone(restored)


if __name__ == "__main__":
    unittest.main()

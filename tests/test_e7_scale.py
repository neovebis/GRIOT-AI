import unittest

from griot_scale import ScaleHarness


class ScaleTests(unittest.TestCase):
    def test_synthetic_scale_invariants_hold(self) -> None:
        report = ScaleHarness(facts=5000, shards=16).run()
        self.assertEqual(report.facts, 5000)
        self.assertEqual(report.indexed, 5000)
        self.assertEqual(report.shards, 16)
        self.assertGreaterEqual(report.min_shard_facts, 0)
        self.assertLessEqual(report.max_shard_facts, 5000)
        self.assertLessEqual(report.query_candidates, 64)
        self.assertLessEqual(report.working_graph_evidence, 128)
        self.assertGreaterEqual(report.elapsed_seconds, 0.0)

if __name__ == "__main__":
    unittest.main()

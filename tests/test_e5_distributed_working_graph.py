import unittest

from griot_distributed_working_graph import DistributedWorkingGraph
from griot_engine import Fact, GRIOT
from griot_working_graph import WorkingGraph


class DistributedWorkingGraphTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.engine.learn("O leão é um animal. O lobo é um animal.", source="memory")

    def test_worker_assignment_is_deterministic(self) -> None:
        graph = DistributedWorkingGraph(workers=4)
        fact = next(iter(self.engine.graph.facts()))
        self.assertEqual(graph.worker_for(fact), graph.worker_for(fact))

    def test_evidence_is_partitioned_and_federated(self) -> None:
        graph = DistributedWorkingGraph(workers=4)
        facts = tuple(self.engine.graph.facts())
        graph.extend(facts, origin="durable")
        state = graph.state()

        self.assertEqual(state.evidence_count, len(facts))
        self.assertEqual(state.direct_count, len(facts))
        self.assertEqual(sum(item.evidence_count for item in state.workers), len(facts))

    def test_query_federates_across_workers(self) -> None:
        graph = DistributedWorkingGraph(workers=3)
        graph.extend(self.engine.graph.facts(), origin="durable")
        animal = self.engine.quids.get("animal").symbol
        result = graph.query(object_=animal, relation="is_a")
        self.assertEqual(len(result), 2)

    def test_source_provenance_is_preserved(self) -> None:
        graph = DistributedWorkingGraph(workers=4)
        graph.extend(self.engine.graph.facts(), origin="durable")
        self.assertEqual(graph.state().sources, ("memory",))

    def test_per_worker_capacity_is_bounded(self) -> None:
        graph = DistributedWorkingGraph(workers=2, max_evidence_per_worker=1)
        for index in range(10):
            graph.add(
                Fact(f"q{index}", "is_a", "x", 1.0, False, f"s{index}"),
                origin="test",
            )
        state = graph.state()
        self.assertLessEqual(
            max(worker.evidence_count for worker in state.workers),
            1,
        )

    def test_empty_workers_are_valid(self) -> None:
        graph = DistributedWorkingGraph(workers=8)
        self.assertEqual(graph.state().evidence_count, 0)


if __name__ == "__main__":
    unittest.main()

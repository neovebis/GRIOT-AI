from __future__ import annotations

import unittest

from griot_execution_control import (
    ExecutionCycleResult,
    ExecutionOperation,
    ExecutionStatus,
)
from griot_reasoning_v040 import TruthStatus
from quid_core import Quid


class TestH2ExecutionControl(unittest.TestCase):
    def setUp(self) -> None:
        self.quid = Quid()

    def test_stop_operation_is_executed_for_verified_result(self) -> None:
        self.quid.engine.learn("O lobo é um animal.", "memory")
        result = self.quid.executar_proximo_passo("O lobo é um animal?")
        self.assertEqual(result.operation, ExecutionOperation.STOP)
        self.assertEqual(result.status, ExecutionStatus.COMPLETED)

    def test_unknown_result_executes_bounded_retrieval(self) -> None:
        result = self.quid.executar_proximo_passo("A é uma entidade desconhecida?")
        self.assertEqual(result.operation, ExecutionOperation.RETRIEVE_MORE_EVIDENCE)
        self.assertIn(result.status, {ExecutionStatus.COMPLETED, ExecutionStatus.WAITING})
        self.assertEqual(result.source_result.epistemic_status, TruthStatus.UNKNOWN)

    def test_hypothesis_operation_returns_explicit_provisional_hypotheses(self) -> None:
        self.quid.engine.learn(
            "A raposa é um animal. O animal tem uma cauda.",
            "knowledge",
        )
        result = self.quid.executar_proximo_passo(
            "Seria possível que a raposa tenha uma cauda?"
        )
        self.assertEqual(result.operation, ExecutionOperation.TEST_HYPOTHESES)
        self.assertIsNotNone(result.step.payload)
        self.assertEqual(result.status, ExecutionStatus.COMPLETED)

    def test_conflict_never_auto_resolves(self) -> None:
        self.quid.engine.learn("O lobo é um animal.", "positive")
        self.quid.engine.learn("O lobo não é um animal.", "negative")
        result = self.quid.executar_proximo_passo("O lobo é um animal?")
        self.assertEqual(result.operation, ExecutionOperation.RESOLVE_CONFLICT)
        self.assertEqual(result.status, ExecutionStatus.WAITING)
        self.assertIsInstance(result.step.payload, dict)
        self.assertTrue(result.step.payload["review_required"])
        self.assertEqual(result.source_result.epistemic_status, TruthStatus.CONFLICT)

    def test_causal_inspection_is_an_executable_operation(self) -> None:
        self.quid.engine.learn(
            "O fogo causa fumaça. O vento causa fumaça.",
            "causes",
        )
        result = self.quid.executar_proximo_passo("Por que existe fumaça?")
        self.assertEqual(result.operation, ExecutionOperation.INSPECT_CAUSAL_PATHS)
        self.assertEqual(result.status, ExecutionStatus.COMPLETED)

    def test_runtime_exposes_execution_control(self) -> None:
        from griot_runtime import GRIOTRuntime
        runtime = GRIOTRuntime(self.quid)
        health = runtime.health()
        self.assertIn("execution_control", health.stages)
        self.assertNotIn("execution_control", health.missing)
        result = runtime.execute_next("2 + 2")
        self.assertEqual(result.operation, ExecutionOperation.STOP)

    def test_bounded_cycle_stops_on_verified_result(self) -> None:
        self.quid.engine.learn("O lobo é um animal.", "memory")
        result = self.quid.executar_ciclo("O lobo é um animal?", max_cycles=4)
        self.assertIsInstance(result, ExecutionCycleResult)
        self.assertEqual(result.stopped_reason, "stop")
        self.assertEqual(result.cycles, 1)
        self.assertEqual(result.steps[0].operation, ExecutionOperation.STOP)

    def test_bounded_cycle_does_not_spin_on_unknown(self) -> None:
        result = self.quid.executar_ciclo(
            "A é uma entidade desconhecida?",
            max_cycles=4,
        )
        self.assertEqual(result.stopped_reason, "waiting")
        self.assertEqual(result.cycles, 1)
        self.assertEqual(
            result.steps[0].operation,
            ExecutionOperation.RETRIEVE_MORE_EVIDENCE,
        )

    def test_bounded_cycle_stops_conflict_in_waiting(self) -> None:
        self.quid.engine.learn("O lobo é um animal.", "positive")
        self.quid.engine.learn("O lobo não é um animal.", "negative")
        result = self.quid.executar_ciclo("O lobo é um animal?", max_cycles=4)
        self.assertEqual(result.stopped_reason, "waiting")
        self.assertEqual(result.cycles, 1)
        self.assertEqual(result.steps[0].operation, ExecutionOperation.RESOLVE_CONFLICT)


if __name__ == "__main__":
    unittest.main()

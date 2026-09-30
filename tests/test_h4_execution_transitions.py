from __future__ import annotations

import unittest

from griot_execution_control import (
    ExecutionCycleResult,
    ExecutionOperation,
    ExecutionState,
    ExecutionTransition,
)
from quid_core import Quid


class TestH4ExecutionTransitions(unittest.TestCase):
    def setUp(self) -> None:
        self.quid = Quid()

    def test_cycle_exposes_initial_state_transition(self) -> None:
        self.quid.engine.learn("O lobo é um animal.", "memory")
        result = self.quid.executar_ciclo("O lobo é um animal?", max_cycles=4)

        self.assertIsInstance(result, ExecutionCycleResult)
        self.assertEqual(len(result.transitions), 1)
        transition = result.transitions[0]
        self.assertIsInstance(transition, ExecutionTransition)
        self.assertIsNone(transition.before)
        self.assertIsInstance(transition.after, ExecutionState)
        self.assertTrue(transition.changed)
        self.assertEqual(transition.reason, "initial_state")
        self.assertFalse(result.progressed)

    def test_repeated_state_is_explicitly_recorded(self) -> None:
        self.quid.engine.learn("O fogo causa fumaça.", "causes")
        result = self.quid.executar_ciclo("Por que o fogo causa fumaça?", max_cycles=4)

        self.assertEqual(result.stopped_reason, "repeated_control_state")
        self.assertEqual(result.cycles, 2)
        self.assertEqual(len(result.steps), 1)
        self.assertEqual(len(result.transitions), 2)
        self.assertFalse(result.transitions[1].changed)
        self.assertEqual(
            result.transitions[1].reason,
            "observable_control_state_unchanged",
        )
        self.assertFalse(result.progressed)

    def test_waiting_is_terminal_without_fake_progress(self) -> None:
        result = self.quid.executar_ciclo("A é uma entidade desconhecida?", max_cycles=4)

        self.assertEqual(result.stopped_reason, "waiting")
        self.assertEqual(result.cycles, 1)
        self.assertFalse(result.progressed)
        self.assertEqual(result.steps[0].status.value, "waiting")


if __name__ == "__main__":
    unittest.main()

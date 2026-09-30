from __future__ import annotations

import unittest

from griot_advanced_reasoning import AdvancedReasoningEngine
from griot_engine import Fact, GRIOT
from griot_reasoning_v040 import TruthStatus
from quid_core import Quid


class TestG3AdvancedReasoning(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.g3 = AdvancedReasoningEngine(self.engine)
        self.quid = Quid(self.engine)

    def test_strategy_selection(self) -> None:
        self.assertEqual(self.g3.select_strategy("2 + 2"), "mathematical")
        self.assertEqual(self.g3.select_strategy("E se o leão é um animal?"), "counterfactual")
        self.assertEqual(self.g3.select_strategy("Por que o fogo causa medo?"), "causal")
        self.assertEqual(self.g3.select_strategy("A está antes de B?"), "temporal")
        self.assertEqual(self.g3.select_strategy("Qual a probabilidade de chuva?"), "probabilistic")
        self.assertEqual(self.g3.select_strategy("Como conseguir o objetivo?"), "planning")
        self.assertEqual(self.g3.select_strategy("Seria possível que A fosse B?"), "hypothetical")

    def test_decomposition_creates_independent_subproblems(self) -> None:
        parts = self.g3.decompose("O leão é um animal. O animal é um ser vivo.")
        self.assertEqual(len(parts), 2)
        self.assertEqual(parts[0].text, "O leão é um animal")
        self.assertEqual(parts[1].text, "O animal é um ser vivo")

    def test_multihop_deduction_and_proof(self) -> None:
        self.engine.learn("O lobo é um animal. O animal é um ser vivo.", "facts")
        result = self.g3.solve("O lobo é um ser vivo?")
        self.assertEqual(result.strategy, "direct")
        self.assertEqual(result.result.status, TruthStatus.SUPPORTED)
        self.assertTrue(result.proof)
        self.assertTrue(result.verification.ok)
        self.assertEqual(result.metacognition.next_operation, "stop")

    def test_temporal_reasoning_is_transitive(self) -> None:
        self.engine.learn("O lobo está antes de o gato. O gato está antes de o cão.", "timeline")
        result = self.g3.temporal_query("lobo antes de cão?")
        self.assertEqual(result.status, TruthStatus.SUPPORTED)
        self.assertTrue(any(step.rule != "direct" for step in result.proofs))

    def test_probabilistic_evidence_aggregation(self) -> None:
        a = self.engine.quids.get("lobo")
        b = self.engine.quids.get("animal") or self.engine.quids.ensure("animal")
        assert a is not None
        self.engine.graph.add_fact(Fact(a.symbol, "is_a", b.symbol, 0.8, False, "source-a"))
        self.engine.graph.add_fact(Fact(a.symbol, "is_a", b.symbol, 0.7, False, "source-b"))
        result = self.g3.solve("O lobo é um animal?")
        self.assertAlmostEqual(result.probabilistic.support_probability, 0.94, places=9)
        self.assertEqual(result.probabilistic.independent_sources, 2)

    def test_conflict_produces_counterexample_and_abstention(self) -> None:
        self.engine.learn("O lobo é um animal.", "positive")
        self.engine.learn("O lobo não é um animal.", "negative")
        result = self.g3.solve("O lobo é um animal?")
        self.assertEqual(result.result.status, TruthStatus.CONFLICT)
        self.assertTrue(result.counterexamples)
        self.assertEqual(result.metacognition.next_operation, "resolve_conflict")
        self.assertTrue(result.metacognition.unresolved)

    def test_hypothesis_generation_for_unknown_claim(self) -> None:
        self.engine.learn("A raposa é um animal. O animal tem uma cauda.", "knowledge")
        result = self.g3.test_hypotheses("A raposa tem uma cauda?")
        self.assertEqual(result.source_status, TruthStatus.UNKNOWN)
        self.assertTrue(result.hypotheses)
        self.assertEqual(result.hypotheses[0].assumption.provenance, "hypothesis")

    def test_rule_discovery_induction(self) -> None:
        self.engine.learn(
            "O lobo é um animal. O animal é um ser vivo. O lobo é um ser vivo.",
            "one",
        )
        self.engine.learn(
            "O gato é um animal. O animal é um ser vivo. O gato é um ser vivo.",
            "two",
        )
        rules = self.g3.induce(min_support=2)
        self.assertTrue(any(
            rule.antecedent_relation == "is_a"
            and rule.bridge_relation == "is_a"
            and rule.consequent_relation == "is_a"
            and rule.support_count >= 2
            for rule in rules
        ))

    def test_abduction_uses_causal_parents(self) -> None:
        self.engine.learn("O fogo causa fumaça. O vento causa fumaça.", "causes")
        result = self.g3.abduce("fumaça")
        self.assertEqual(result.direction, "causes")
        self.assertEqual(len(result.direct), 2)

    def test_counterfactual_isolated_from_memory(self) -> None:
        self.engine.learn("O fogo causa fumaça.", "memory")
        scenario = self.g3.test_counterfactual(
            "O fogo não causa fumaça.",
            "O fogo causa fumaça?",
        )
        self.assertTrue(scenario.changed)
        self.assertTrue(self.engine.graph.facts())

    def test_mathematical_reasoning_returns_value(self) -> None:
        result = self.g3.solve("calcula 2 + 3 * 4")
        self.assertEqual(result.strategy, "mathematical")
        self.assertTrue(result.solved)
        self.assertEqual(result.answer_value, 14)
        self.assertIsNotNone(result.math_result)
        self.assertEqual(result.math_result.status, "exact")
        self.assertEqual(result.metacognition.next_operation, "stop")

    def test_explicit_reasoning_modes_exist(self) -> None:
        self.engine.learn("O lobo é um animal. O animal é um ser vivo.", "knowledge")
        self.assertEqual(self.g3.deduce("O lobo é um ser vivo?").status, TruthStatus.SUPPORTED)
        self.assertTrue(self.g3.induce(min_support=2) == ())
        self.engine.learn("X causa Y.", "knowledge")
        self.assertEqual(self.g3.abduce("Y").direction, "causes")

    def test_hierarchical_planning_composes_subgoals(self) -> None:
        self.g3.planner.register_action(
            "preparar A",
            add_effects=("A",),
        )
        self.g3.planner.register_action(
            "preparar B",
            preconditions=("A",),
            add_effects=("B",),
        )
        plans = self.g3.hierarchical_plan((), ("A", "B"))
        self.assertEqual(len(plans), 2)
        self.assertTrue(all(plan.verified for plan in plans))

    def test_unknown_claim_selects_more_evidence(self) -> None:
        result = self.g3.solve("A é uma coisa desconhecida?")
        self.assertEqual(result.result.status, TruthStatus.UNKNOWN)
        self.assertEqual(result.metacognition.next_operation, "retrieve_more_evidence")
        self.assertTrue(result.metacognition.unresolved)


if __name__ == "__main__":
    unittest.main()

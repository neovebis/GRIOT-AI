import unittest

from griot_engine import Fact, GRIOT
from griot_gir import GIR
from griot_math import MathEngine, MathStatus
from griot_runtime import GRIOTRuntime
from griot_semantic_ir import SemanticGRIOT


class AdversarialTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.runtime = GRIOTRuntime()

    def test_empty_and_non_string_inputs_fail_cleanly(self) -> None:
        with self.assertRaises(ValueError):
            self.runtime.analyze("")
        with self.assertRaises(TypeError):
            self.runtime.analyze(None)

    def test_malicious_math_expression_is_rejected(self) -> None:
        math = MathEngine(self.engine)
        result = math.calculate("Calcula __import__('os').system('echo hacked').")
        self.assertEqual(result.status, MathStatus.INVALID)
        self.assertIsNone(result.value)

    def test_large_expression_does_not_blow_exact_power_limit(self) -> None:
        math = MathEngine(self.engine)
        result = math.evaluate("2**10001")
        self.assertIn(result.status, {MathStatus.INVALID, MathStatus.APPROXIMATE})

    def test_pathological_causal_cycle_terminates(self) -> None:
        self.engine.learn(
            "A chuva causa fogo. O fogo causa fumo. O fumo causa chuva.",
            source="cycle",
        )
        analysis = self.runtime.quid.causes_of("chuva", max_depth=20)
        self.assertTrue(analysis.cycles)
        self.assertLessEqual(
            max((path.depth for path in analysis.paths), default=0),
            20,
        )

    def test_conflicting_memory_cannot_produce_boolean_answer(self) -> None:
        self.engine.learn("O leão é um animal.", source="a")
        self.engine.learn("O leão não é um animal.", source="b")
        result = self.runtime.analyze("leão é um animal")
        self.assertIsNone(result.result.answer)
        self.assertTrue(result.result.abstained)

    def test_invalid_gir_does_not_pass_validation(self) -> None:
        semantic = SemanticGRIOT(self.engine)
        valid = semantic.understand("leão é um animal")
        bad = GIR(
            text=valid.text,
            frame=valid.frame,
            nodes=valid.nodes,
            edges=tuple(
                edge.__class__(
                    edge.source,
                    edge.relation,
                    "q:does-not-exist",
                    edge.family_id,
                    edge.confidence,
                    edge.negated,
                    edge.evidence,
                )
                for edge in valid.edges
            ),
            vector=valid.vector,
            constraints=valid.constraints,
            provenance=valid.provenance,
        )
        with self.assertRaises(ValueError):
            bad.validate()

    def test_many_duplicate_inputs_remain_bounded(self) -> None:
        for index in range(100):
            self.engine.learn("O leão é um animal.", source=f"s{index}")
        result = self.runtime.analyze("leão é um animal")
        self.assertTrue(result.result.working_graph.evidence_count <= 256)

    def test_unicode_q_uid_invariant_remains_enforced(self) -> None:
        self.engine.graph.add_fact(Fact("xx", "is_a", "yy", 1.0, False, "bad"))
        with self.assertRaises((ValueError, TypeError)):
            self.runtime.analyze("xx é yy")


if __name__ == "__main__":
    unittest.main()

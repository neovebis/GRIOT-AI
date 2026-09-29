import unittest

from griot_cognition_v100 import EpistemicStateEngine, EpistemicStatus, ProvenanceRecord, ProvenanceTrace
from griot_engine import GRIOT
from griot_epistemic_gate_v120 import AbstentionReason, EpistemicGate, GateDecision
from griot_reasoning_v040 import TruthStatus
from quid_core import Quid


class ProvenanceEpistemicTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.quid = Quid(self.engine)

    def test_provenance_trace_deduplicates_and_counts_only_evidence_sources(self) -> None:
        trace = ProvenanceTrace(
            (
                ProvenanceRecord("source-a", "direct", "is_a", "🦁", "🐺", 0.9, "direct"),
                ProvenanceRecord("source-a", "direct", "is_a", "🦁", "🐺", 0.9, "direct"),
                ProvenanceRecord("rule", "inference", "is_a", "🦁", "x", 0.8, "transitive:type"),
            )
        )
        self.assertEqual(len(trace.records), 2)
        self.assertEqual(trace.sources, ("source-a",))
        self.assertEqual(trace.source_diversity, 1)
        self.assertEqual(trace.depth, 1)

    def test_supported_reasoning_becomes_explicit_epistemic_state(self) -> None:
        self.engine.learn("O leão é um animal.", source="book-a")
        result = self.quid.analisar("leão é um animal")
        assessment = result.epistemic

        self.assertEqual(assessment.status, EpistemicStatus.SUPPORTED)
        self.assertTrue(assessment.answer)
        self.assertEqual(assessment.source_diversity, 1)
        self.assertEqual(result.provenance, ("book-a",))
        self.assertEqual(result.provenance_trace.sources, ("book-a",))
        self.assertEqual(result.epistemic_status, TruthStatus.SUPPORTED)

    def test_multiple_sources_are_distinguished(self) -> None:
        self.engine.learn("O leão é um animal.", source="book-a")
        self.engine.learn("O leão é um animal.", source="book-b")
        result = self.quid.analisar("leão é um animal")
        self.assertEqual(result.epistemic.source_diversity, 2)
        self.assertEqual(result.provenance, ("book-a", "book-b"))

    def test_unknown_and_conflict_abstain(self) -> None:
        unknown = self.quid.analisar("leão é uma galáxia")
        self.assertTrue(unknown.epistemic.abstained)
        self.assertEqual(unknown.epistemic.status, EpistemicStatus.UNKNOWN)

        self.engine.learn("O leão é um mamífero.", source="a")
        self.engine.learn("O leão não é um mamífero.", source="b")
        conflict = self.quid.analisar("leão é um mamífero")
        self.assertTrue(conflict.epistemic.abstained)
        self.assertEqual(conflict.epistemic.status, EpistemicStatus.CONFLICT)

    def test_gate_consumes_formal_assessment(self) -> None:
        self.engine.learn("O leão é um animal.", source="book-a")
        assessment = self.quid.analisar("leão é um animal").epistemic
        decision = EpistemicGate().evaluate(assessment)
        self.assertEqual(decision.decision, GateDecision.ANSWER)
        self.assertEqual(decision.answer, True)
        self.assertEqual(decision.reason, AbstentionReason.NONE)

    def test_gate_rejects_unknown_and_conflict(self) -> None:
        unknown = self.quid.analisar("leão é uma galáxia").epistemic
        self.assertEqual(EpistemicGate().evaluate(unknown).reason, AbstentionReason.UNKNOWN)

        self.engine.learn("O leão é um mamífero.", source="a")
        self.engine.learn("O leão não é um mamífero.", source="b")
        conflict = self.quid.analisar("leão é um mamífero").epistemic
        self.assertEqual(EpistemicGate().evaluate(conflict).reason, AbstentionReason.CONFLICT)

    def test_epistemic_state_engine_is_deterministic(self) -> None:
        self.engine.learn("O leão é um animal.", source="book-a")
        analysis = self.quid.analisar("leão é um animal")
        evaluator = EpistemicStateEngine()
        a = evaluator.assess(analysis.reasoning, analysis.text)
        b = evaluator.assess(analysis.reasoning, analysis.text)
        self.assertEqual(a, b)


if __name__ == "__main__":
    unittest.main()

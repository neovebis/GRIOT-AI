import unittest
from dataclasses import replace

from griot_cognition_v100 import EpistemicStateEngine
from griot_engine import GRIOT
from griot_reasoning_v040 import ReasoningEngine, ProofStep, ReasoningResult, TruthStatus
from griot_semantic_ir import SemanticGRIOT
from griot_verification import VerificationEngine, VerificationStatus
from quid_core import Quid


class VerificationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.quid = Quid(self.engine)
        self.verifier = VerificationEngine()

    def test_supported_answer_is_verified(self) -> None:
        self.engine.learn("O leão é um animal.", source="memory")
        result = self.quid.analisar("leão é um animal")
        self.assertEqual(result.verification.status, VerificationStatus.VERIFIED)
        self.assertTrue(result.verification.ok)
        self.assertTrue(result.answer)

    def test_unknown_is_verified_as_abstention(self) -> None:
        result = self.quid.analisar("leão é uma galáxia")
        self.assertTrue(result.verification.ok)
        self.assertIsNone(result.answer)

    def test_conflict_is_verified_as_abstention(self) -> None:
        self.engine.learn("O leão é um animal.", source="a")
        self.engine.learn("O leão não é um animal.", source="b")
        result = self.quid.analisar("leão é um animal")
        self.assertTrue(result.verification.ok)
        self.assertEqual(result.epistemic_status, TruthStatus.CONFLICT)
        self.assertIsNone(result.answer)

    def test_reasoning_replay_is_deterministic(self) -> None:
        self.engine.learn("O leão é um animal.", source="memory")
        result = self.quid.analisar("leão é um animal")
        self.assertTrue(result.verification.deterministic)

    def test_ungrounded_direct_proof_is_rejected(self) -> None:
        semantic = SemanticGRIOT(self.engine)
        meaning = semantic.understand("leão é um animal")
        reasoning = ReasoningEngine(semantic)
        original = reasoning.reason_meaning("", meaning)
        fake = ProofStep("is_a", "🦁", self.engine.quids.get("animal").symbol, 1.0, "direct", "fabricated")
        forged = replace(
            original,
            status=TruthStatus.SUPPORTED,
            confidence=1.0,
            proofs=(fake,),
        )
        assessment = EpistemicStateEngine().assess(forged, "leão é um animal")
        report = self.verifier.verify(
            meaning,
            forged,
            assessment,
            reasoning_engine=reasoning,
        )
        self.assertEqual(report.status, VerificationStatus.REJECTED)
        self.assertTrue(any(issue.code == "proof-not-grounded" for issue in report.issues))

    def test_epistemic_mismatch_is_rejected(self) -> None:
        self.engine.learn("O leão é um animal.", source="memory")
        analysis = self.quid.analisar("leão é um animal")
        forged = replace(
            analysis.epistemic,
            status=type(analysis.epistemic.status).REFUTED,
            answer=False,
        )
        report = self.verifier.verify(
            analysis.gir,
            analysis.reasoning,
            forged,
            reasoning_engine=self.quid.reasoning,
        )
        self.assertEqual(report.status, VerificationStatus.REJECTED)
        self.assertTrue(any(issue.code == "epistemic-mismatch" for issue in report.issues))


if __name__ == "__main__":
    unittest.main()

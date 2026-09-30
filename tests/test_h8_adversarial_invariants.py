from __future__ import annotations

import unittest

from griot_engine import Fact, GRIOT
from griot_reasoning_invariants import ReasoningInvariantEngine
from griot_reasoning_v040 import ReasoningEngine, TruthStatus
from griot_semantic_ir import SemanticGRIOT


class H8InvariantTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.semantic = SemanticGRIOT(self.engine)
        self.reasoning = ReasoningEngine(self.semantic)
        self.invariants = ReasoningInvariantEngine()

    def _learn(self, *texts: str) -> None:
        for text in texts:
            self.semantic.learn(text, "h8")

    def _solve(self, text: str):
        meaning = self.semantic.understand(text)
        return self.reasoning.reason_meaning(text, meaning)

    def test_positive_negative_are_polarity_duals(self) -> None:
        self._learn("O lobo é um animal.")
        positive = self._solve("O lobo é um animal?")
        negative = self._solve("O lobo não é um animal?")
        self.assertEqual(positive.status, TruthStatus.SUPPORTED)
        self.assertEqual(negative.status, TruthStatus.REFUTED)
        self.assertTrue(positive.proofs)
        self.assertTrue(negative.proofs)

    def test_negative_fact_supports_negative_query(self) -> None:
        self._learn("O lobo não é um animal.")
        result = self._solve("O lobo não é um animal?")
        self.assertEqual(result.status, TruthStatus.SUPPORTED)

    def test_negative_fact_refutes_positive_query(self) -> None:
        self._learn("O lobo não é um animal.")
        result = self._solve("O lobo é um animal?")
        self.assertEqual(result.status, TruthStatus.REFUTED)

    def test_both_polarities_force_conflict(self) -> None:
        self._learn("O lobo é um animal.", "O lobo não é um animal.")
        positive = self._solve("O lobo é um animal?")
        negative = self._solve("O lobo não é um animal?")
        self.assertEqual(positive.status, TruthStatus.CONFLICT)
        self.assertEqual(negative.status, TruthStatus.CONFLICT)

    def test_unknown_has_no_proof(self) -> None:
        result = self._solve("O dragão é um animal?")
        self.assertEqual(result.status, TruthStatus.UNKNOWN)
        self.assertEqual(result.proofs, ())

    def test_claim_status_composition_is_explicit(self) -> None:
        self._learn("O lobo é um animal.", "A raposa é um animal.")
        meaning = self.semantic.understand("O lobo é um animal? A raposa é um animal?")
        result = self.reasoning.reason_meaning("", meaning)
        self.assertIn(result.status, {TruthStatus.SUPPORTED, TruthStatus.UNKNOWN})
        self.assertEqual(len(result.claims), 2)
        self.assertEqual(
            tuple(claim.status for claim in result.claims),
            (TruthStatus.SUPPORTED, TruthStatus.SUPPORTED),
        )

    def test_mixed_supported_and_unknown_does_not_become_supported(self) -> None:
        self._learn("O lobo é um animal.")
        meaning = self.semantic.understand("O lobo é um animal? O dragão é um animal?")
        result = self.reasoning.reason_meaning("", meaning)
        self.assertEqual(result.status, TruthStatus.UNKNOWN)

    def test_mixed_supported_and_refuted_is_refuted_without_conflict(self) -> None:
        self._learn("O lobo é um animal.", "A raposa não é um animal.")
        meaning = self.semantic.understand("O lobo é um animal? A raposa é um animal?")
        result = self.reasoning.reason_meaning("", meaning)
        self.assertEqual(result.status, TruthStatus.REFUTED)

    def test_direct_fact_proof_is_grounded(self) -> None:
        self._learn("O lobo é um animal.")
        meaning = self.semantic.understand("O lobo é um animal?")
        result = self.reasoning.reason_meaning("", meaning)
        report = self.invariants.check(result, durable_facts=self.engine.graph.facts())
        self.assertTrue(report.ok, report.issues)

    def test_transitive_invariant_is_accepted(self) -> None:
        self._learn("O leão é um animal.", "O animal é um ser vivo.")
        result = self._solve("O leão é um ser vivo?")
        report = self.invariants.check(result, durable_facts=self.engine.graph.facts())
        self.assertEqual(result.status, TruthStatus.SUPPORTED)
        self.assertTrue(report.ok, report.issues)

    def test_unknown_invariant(self) -> None:
        result = self._solve("O dragão é um animal?")
        report = self.invariants.check(result, durable_facts=self.engine.graph.facts())
        self.assertTrue(report.ok, report.issues)

    def test_conflict_invariant(self) -> None:
        self._learn("O lobo é um animal.", "O lobo não é um animal.")
        result = self._solve("O lobo é um animal?")
        report = self.invariants.check(result, durable_facts=self.engine.graph.facts())
        self.assertTrue(report.ok, report.issues)

    def test_atomic_quid_identity_survives_reasoning(self) -> None:
        self._learn("O lobo é um animal.")
        result = self._solve("O lobo é um animal?")
        self.assertTrue(all(len(node.quid) == 1 for node in result.meaning.nodes))

    def test_invariant_rejects_unknown_with_fake_proof(self) -> None:
        result = self._solve("O dragão é um animal?")
        from dataclasses import replace
        from griot_reasoning_v040 import ProofStep
        fake = replace(
            result,
            proofs=(ProofStep("is_a", result.meaning.nodes[0].quid, result.meaning.nodes[-1].quid, 0.9, "direct", "fake"),),
        )
        report = self.invariants.check(fake, durable_facts=())
        self.assertFalse(report.ok)
        self.assertIn("unknown-has-proof", report.codes)

    def test_invariant_rejects_claim_status_without_evidence(self) -> None:
        result = self._solve("O dragão é um animal?")
        from dataclasses import replace
        claim = replace(
            result.claims[0],
            status=TruthStatus.SUPPORTED,
        )
        fake = replace(result, status=TruthStatus.SUPPORTED, claims=(claim,))
        report = self.invariants.check(fake, durable_facts=())
        self.assertFalse(report.ok)
        self.assertIn("supported-without-polarity-evidence", report.codes)

    def test_verification_accepts_transitive_reasoning(self) -> None:
        self._learn("O leão é um animal.", "O animal é um ser vivo.")
        result = self._solve("O leão é um ser vivo?")
        from griot_cognition_v100 import EpistemicStateEngine
        from griot_verification import VerificationEngine
        report = VerificationEngine().verify(
            result.meaning,
            result,
            EpistemicStateEngine().assess(result, "O leão é um ser vivo?"),
            reasoning_engine=self.reasoning,
        )
        self.assertTrue(report.ok, report.issues)

    def test_proof_order_is_canonical(self) -> None:
        self.semantic.learn("O lobo é um animal.", "bootstrap")
        self.engine.graph.add_fact(Fact(
            self.engine.quids.get("lobo").symbol,
            "is_a",
            self.engine.quids.get("animal").symbol,
            0.80,
            False,
            "z-source",
        ))
        self.engine.graph.add_fact(Fact(
            self.engine.quids.get("lobo").symbol,
            "is_a",
            self.engine.quids.get("animal").symbol,
            0.95,
            False,
            "a-source",
        ))
        first = self._solve("O lobo é um animal?")
        second = self._solve("O lobo é um animal?")
        self.assertEqual(first.proofs, second.proofs)
        self.assertEqual(
            tuple((p.rule, p.provenance, p.confidence) for p in first.proofs),
            tuple((p.rule, p.provenance, p.confidence) for p in second.proofs),
        )

    def test_fact_insertion_order_does_not_change_proof_order(self) -> None:
        self.semantic.learn("O lobo é um animal.", "bootstrap")
        lobo = self.engine.quids.get("lobo").symbol
        animal = self.engine.quids.get("animal").symbol
        facts = (
            Fact(lobo, "is_a", animal, 0.80, False, "z-source"),
            Fact(lobo, "is_a", animal, 0.95, False, "a-source"),
        )
        e1 = GRIOT.create()
        e2 = GRIOT.create()
        for fact in facts:
            e1.graph.add_fact(fact)
        for fact in reversed(facts):
            e2.graph.add_fact(fact)
        r1 = ReasoningEngine(SemanticGRIOT(e1)).reason("O lobo é um animal?")
        r2 = ReasoningEngine(SemanticGRIOT(e2)).reason("O lobo é um animal?")
        self.assertEqual(r1.proofs, r2.proofs)

    def test_semantic_relation_paraphrases_preserve_relation(self) -> None:
        a = self.semantic.understand("O vento causa erosão.")
        b = self.semantic.understand("O vento provoca erosão.")
        edges_a = {(e.relation, e.negated) for e in a.edges}
        edges_b = {(e.relation, e.negated) for e in b.edges}
        self.assertIn(("causes", False), edges_a)
        self.assertIn(("causes", False), edges_b)

    def test_surface_normalization_preserves_semantic_edges(self) -> None:
        variants = (
            "O lobo é um animal.",
            "o lobo é um animal!",
            "  O   lobo   é   um animal?  ",
        )
        signatures = []
        for variant in variants:
            meaning = self.semantic.understand(variant)
            signatures.append(
                (
                    tuple(sorted((node.quid, node.kind) for node in meaning.nodes)),
                    tuple(sorted((edge.relation, edge.negated) for edge in meaning.edges)),
                )
            )
        self.assertEqual(len(set(signatures)), 1)

    def test_query_negation_only_changes_requested_polarity(self) -> None:
        positive = self.semantic.understand("O lobo é um animal?")
        negative = self.semantic.understand("O lobo não é um animal?")
        pos_edges = {(e.relation, e.negated) for e in positive.edges}
        neg_edges = {(e.relation, e.negated) for e in negative.edges}
        self.assertIn(("is_a", False), pos_edges)
        self.assertIn(("is_a", True), neg_edges)

    def test_equivalent_whitespace_has_same_fingerprint(self) -> None:
        a = self.semantic.understand("O lobo é um animal.")
        b = self.semantic.understand("  O   lobo   é   um animal. ")
        self.assertEqual(a.fingerprint(), b.fingerprint())

    def test_invariants_are_deterministic(self) -> None:
        self._learn("O lobo é um animal.")
        reports = []
        for _ in range(20):
            result = self._solve("O lobo é um animal?")
            report = self.invariants.check(result, durable_facts=self.engine.graph.facts())
            reports.append((report.ok, report.codes))
        self.assertEqual(len(set(reports)), 1)

    def test_no_durable_fact_is_created_by_reasoning(self) -> None:
        self._learn("O lobo é um animal.")
        before = tuple(self.engine.graph.facts())
        self._solve("O lobo é um animal?")
        after = tuple(self.engine.graph.facts())
        self.assertEqual(
            {
                (f.subject, f.relation, f.object, f.negated, f.provenance)
                for f in before
            },
            {
                (f.subject, f.relation, f.object, f.negated, f.provenance)
                for f in after
            },
        )


# Parameterized adversarial corpus: each entry is an invariant-preserving
# perturbation or a deliberate contradiction/unknown boundary.
ADV_CASES = [
    ("O lobo é um animal?", "o   lobo é um animal!", TruthStatus.SUPPORTED),
    ("O lobo é um animal?", "  O lobo é um animal  ", TruthStatus.SUPPORTED),
    ("O lobo é um animal?", "O lobo\té um animal?", TruthStatus.SUPPORTED),
    ("O lobo é um animal?", "O  lobo  é  um  animal?", TruthStatus.SUPPORTED),
    ("O lobo é um animal?", "O lobo é um animal; ", TruthStatus.SUPPORTED),
    ("O lobo é um animal?", "O lobo é um animal:", TruthStatus.SUPPORTED),
    ("O lobo é um animal?", "O lobo é um animal!", TruthStatus.SUPPORTED),
    ("O lobo é um animal?", "O lobo é um animal???", TruthStatus.SUPPORTED),
    ("O lobo não é um animal?", "O lobo não é um animal?", TruthStatus.REFUTED),
    ("O dragão é um animal?", "O dragão é um animal.", TruthStatus.UNKNOWN),
]


class H8MetamorphicCorpusTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.semantic = SemanticGRIOT(self.engine)
        self.reasoning = ReasoningEngine(self.semantic)

    def test_corpus(self) -> None:
        self.semantic.learn("O lobo é um animal.", "h8-corpus")
        for seed, variant, expected in ADV_CASES:
            with self.subTest(seed=seed, variant=variant):
                left = self.reasoning.reason(seed)
                right = self.reasoning.reason(variant)
                self.assertEqual(left.status, expected)
                self.assertEqual(right.status, expected)


if __name__ == "__main__":
    unittest.main()
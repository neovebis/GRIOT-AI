import unittest

from griot_ambiguity import AmbiguityResolver
from griot_semantic_ir import SemanticGRIOT
from griot_engine import GRIOT


class AmbiguityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.semantic = SemanticGRIOT(self.engine)
        self.resolver = AmbiguityResolver(self.engine)

    def test_financial_bank_is_selected_from_local_context(self) -> None:
        analysis = self.resolver.analyze("O banco tem uma conta e dinheiro.")
        resolution = analysis.resolutions[0]

        self.assertEqual(resolution.surface, "banco")
        self.assertTrue(resolution.resolved)
        self.assertEqual(resolution.chosen, "bank_financial")
        self.assertGreater(resolution.confidence, 0.5)

        meaning = self.semantic.understand("O banco tem uma conta e dinheiro.")
        bank = next(node for node in meaning.nodes if node.surface == "banco")
        self.assertEqual(
            bank.quid,
            next(
                candidate.quid
                for candidate in resolution.candidates
                if candidate.sense == "bank_financial"
            ),
        )

    def test_bench_bank_is_selected_from_environment(self) -> None:
        meaning = self.semantic.understand("O banco fica no parque de madeira.")
        resolution = meaning.constraints["ambiguity"][0]

        self.assertEqual(resolution["surface"], "banco")
        self.assertEqual(resolution["status"], "resolved")
        self.assertEqual(resolution["chosen"], "bench_seat")

    def test_equal_context_keeps_ambiguity_explicit(self) -> None:
        analysis = self.resolver.analyze("O banco existe.")
        resolution = analysis.resolutions[0]

        self.assertFalse(resolution.resolved)
        self.assertIsNone(resolution.chosen)
        self.assertEqual(resolution.status, "ambiguous")
        self.assertEqual(len(resolution.candidates), 2)

        meaning = self.semantic.understand("O banco existe.")
        self.assertTrue(meaning.constraints["ambiguity"])
        self.assertEqual(meaning.constraints["ambiguity"][0]["chosen"], None)

    def test_prior_context_can_disambiguate_a_later_query(self) -> None:
        prior = self.semantic.understand("O banco tem uma conta.")
        self.engine.context.ingest(prior, source="prior-finance")

        analysis = self.resolver.analyze(
            "O banco está aberto.",
            context_records=self.engine.context.records(),
        )
        resolution = analysis.resolutions[0]

        self.assertTrue(resolution.resolved)
        self.assertEqual(resolution.chosen, "bank_financial")

    def test_unrelated_context_does_not_create_a_random_winner(self) -> None:
        prior = self.semantic.understand("O lobo corre no parque.")
        self.engine.context.ingest(prior, source="prior-unrelated")

        resolution = self.resolver.analyze(
            "O banco existe.",
            context_records=self.engine.context.records(),
        ).resolutions[0]

        self.assertFalse(resolution.resolved)
        self.assertIsNone(resolution.chosen)

    def test_candidate_quids_are_stable_across_resolution_calls(self) -> None:
        a = self.resolver.analyze("O banco existe.").resolutions[0]
        b = self.resolver.analyze("O banco existe.").resolutions[0]
        self.assertEqual(
            tuple(candidate.quid for candidate in a.candidates),
            tuple(candidate.quid for candidate in b.candidates),
        )


if __name__ == "__main__":
    unittest.main()

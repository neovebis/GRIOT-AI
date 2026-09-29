import unittest

from griot_engine import GRIOT
from griot_extraction import KnowledgeExtractor
from quid_core import Quid


class ExtractionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.extractor = KnowledgeExtractor(self.engine)
        self.quid = Quid(self.engine)

    def test_extraction_returns_gir_and_fact_candidates(self) -> None:
        batch = self.extractor.extract("O leão é um animal.")
        self.assertTrue(batch.candidates)
        self.assertEqual(batch.candidates[0].fact.relation, "is_a")
        self.assertTrue(batch.gir.fingerprint())
        self.assertEqual(
            batch.candidates[0].gir_fingerprint,
            batch.gir.fingerprint(),
        )

    def test_extraction_does_not_commit_to_graph(self) -> None:
        before = set(self.engine.graph.facts())
        self.extractor.extract("O leão é um animal.")
        self.assertEqual(set(self.engine.graph.facts()), before)

    def test_extraction_confidence_and_source_are_explicit(self) -> None:
        batch = self.extractor.extract("O leão é um animal.")
        candidate = batch.candidates[0]
        self.assertEqual(candidate.source_text, "O leão é um animal.")
        self.assertGreaterEqual(candidate.extraction_confidence, 0.0)
        self.assertLessEqual(candidate.extraction_confidence, 1.0)

    def test_multiple_sentences_stay_in_one_gir_batch(self) -> None:
        batch = self.extractor.extract(
            "O leão é um animal. O lobo é um animal."
        )
        self.assertGreaterEqual(len(batch.candidates), 2)
        self.assertEqual(
            len({candidate.gir_fingerprint for candidate in batch.candidates}),
            1,
        )

    def test_extract_many_is_non_mutating(self) -> None:
        batches = self.extractor.extract_many(
            ("O leão é um animal.", "O lobo é um animal.")
        )
        self.assertEqual(len(batches), 2)
        self.assertEqual(len(self.engine.graph.facts()), 0)

    def test_quid_exposes_staged_extraction(self) -> None:
        batch = self.quid.extract_knowledge("O leão é um animal.")
        self.assertTrue(batch.candidates)
        self.assertEqual(len(self.engine.graph.facts()), 0)


if __name__ == "__main__":
    unittest.main()

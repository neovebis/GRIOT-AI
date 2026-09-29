import unittest

from griot_deduplication import SemanticDeduplicator
from griot_engine import Fact, GRIOT
from griot_extraction import ExtractionCandidate
from griot_semantic_ir import SemanticGRIOT
from quid_core import Quid


class DeduplicationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.semantic = SemanticGRIOT(self.engine)
        self.dedup = SemanticDeduplicator()
        self.quid = Quid(self.engine)

    def _candidate(self, provenance: str, *, negated: bool = False) -> ExtractionCandidate:
        gir = self.semantic.understand("O leão é um animal.")
        subject = next(node.quid for node in gir.nodes if node.surface == "leão")
        object_ = next(node.quid for node in gir.nodes if node.surface == "animal")
        fact = Fact(subject, "is_a", object_, 0.9, negated, provenance, "evidence")
        return ExtractionCandidate(fact, "raw", gir.fingerprint(), 0.9)

    def test_equivalent_facts_are_grouped(self) -> None:
        report = self.dedup.deduplicate((
            self._candidate("source-a"),
            self._candidate("source-b"),
            self._candidate("source-c"),
        ))
        self.assertEqual(len(report.groups), 1)
        self.assertEqual(report.groups[0].source_count, 3)
        self.assertEqual(report.duplicates_removed, 2)

    def test_representative_is_highest_confidence_then_deterministic(self) -> None:
        base = self._candidate("source-b")
        stronger_fact = Fact(
            base.fact.subject,
            base.fact.relation,
            base.fact.object,
            0.99,
            False,
            "source-a",
            "strong",
        )
        stronger = ExtractionCandidate(
            stronger_fact,
            base.source_text,
            base.gir_fingerprint,
            0.99,
        )
        report = self.dedup.deduplicate((base, stronger))
        self.assertEqual(report.groups[0].representative.fact.provenance, "source-a")

    def test_positive_and_negative_polarities_do_not_collapse(self) -> None:
        report = self.dedup.deduplicate((
            self._candidate("positive"),
            self._candidate("negative", negated=True),
        ))
        self.assertEqual(len(report.groups), 2)
        self.assertFalse(report.conflict_groups)

    def test_duplicate_group_does_not_destroy_source_identity(self) -> None:
        report = self.dedup.deduplicate((
            self._candidate("a"),
            self._candidate("b"),
        ))
        group = report.groups[0]
        self.assertEqual(
            {candidate.fact.provenance for candidate in group.candidates},
            {"a", "b"},
        )

    def test_quid_exposes_only_valid_deduplication(self) -> None:
        batch = self.quid.extract_knowledge("O leão é um animal.")
        report = self.quid.deduplicate_knowledge(batch)
        self.assertEqual(len(report.groups), 1)


if __name__ == "__main__":
    unittest.main()

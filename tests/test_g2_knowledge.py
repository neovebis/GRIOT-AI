from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from griot_engine import GRIOT
from griot_knowledge_acquisition import KnowledgeAcquisitionEngine, KnowledgeSource
from quid_core import Quid
from griot_validation import ValidationStatus


class TestG2KnowledgeAcquisition(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.quid = Quid(self.engine)

    def test_source_becomes_structured_knowledge_and_memory(self) -> None:
        report = self.quid.acquire_knowledge(
            "O leão é um animal.",
            source="book-1",
            document_id="doc-1",
        )
        self.assertTrue(report.changed)
        self.assertEqual(len(report.facts), 1)
        self.assertEqual(report.facts[0].relation, "is_a")
        self.assertEqual(report.facts[0].provenance, "book-1")
        self.assertTrue(report.entities)
        self.assertEqual(len(report.quids), 2)
        self.assertIn(report.facts[0], self.engine.graph.facts())

    def test_multi_sentence_relations_are_acquired(self) -> None:
        report = self.quid.acquire_knowledge(
            "O leão é um animal. O animal é um ser vivo. O leão tem uma juba.",
            source="encyclopedia",
            document_id="animals",
        )
        relations = {(fact.relation, self.engine.quids.get(fact.subject).label, self.engine.quids.get(fact.object).label) for fact in report.facts}
        self.assertIn(("is_a", "leão", "animal"), relations)
        self.assertIn(("is_a", "animal", "ser vivo"), relations)
        self.assertIn(("has", "leão", "juba"), relations)

    def test_event_and_temporal_extraction(self) -> None:
        report = self.quid.acquire_knowledge(
            "João estava atacando o lobo ontem.",
            source="story",
            document_id="story-1",
        )
        self.assertEqual(len(report.events), 1)
        event = report.events[0]
        self.assertEqual(event.relation, "attacks")
        self.assertEqual(event.tense, "past_imperfect")
        self.assertEqual(event.aspect, "progressive")
        self.assertTrue(report.temporals)
        self.assertEqual(report.temporals[0].normalized, "past")

    def test_deduplication_commits_one_representative_per_source_batch(self) -> None:
        report = self.quid.acquire_knowledge(
            "O leão é um animal. O leão é um animal.",
            source="book",
            document_id="dup",
        )
        self.assertEqual(report.deduplication.duplicates_removed, 1)
        self.assertEqual(len(report.facts), 1)
        self.assertEqual(len(self.engine.graph.facts()), 1)

    def test_same_fact_from_distinct_sources_is_preserved(self) -> None:
        self.quid.acquire_knowledge(
            "O leão é um animal.",
            source="book-a",
            document_id="a",
        )
        second = self.quid.acquire_knowledge(
            "O leão é um animal.",
            source="book-b",
            document_id="b",
        )
        sources = {fact.provenance for fact in self.engine.graph.facts()}
        self.assertEqual(sources, {"book-a", "book-b"})
        self.assertEqual(len(second.facts), 1)

    def test_conflicting_knowledge_is_rejected_and_queued_for_review(self) -> None:
        self.quid.acquire_knowledge(
            "O leão é um animal.",
            source="source-a",
            document_id="a",
        )
        report = self.quid.acquire_knowledge(
            "O leão não é um animal.",
            source="source-b",
            document_id="b",
        )
        self.assertEqual(len(report.conflicts), 1)
        self.assertEqual(report.conflicts[0].status, ValidationStatus.CONFLICT)
        self.assertEqual(len(report.facts), 0)
        self.assertEqual(len(report.review_items), 1)
        self.assertEqual(len(self.quid.knowledge_review_queue()), 1)

    def test_human_review_can_reject_or_approve_a_conflict(self) -> None:
        self.quid.acquire_knowledge(
            "O leão é um animal.",
            source="source-a",
            document_id="a",
        )
        report = self.quid.acquire_knowledge(
            "O leão não é um animal.",
            source="source-b",
            document_id="b",
        )
        review_id = report.review_items[0].review_id
        approved = self.quid.review_knowledge(review_id, "approve")
        self.assertEqual(approved.status, "approved")
        self.assertTrue(
            self.engine.graph.contradictory(
                self.engine.quids.get("leão").symbol,
                "is_a",
                self.engine.quids.get("animal").symbol,
            )
        )

    def test_staged_knowledge_requires_review_before_commit(self) -> None:
        report = self.quid.acquire_knowledge(
            "A raposa é um animal.",
            source="staged",
            document_id="staged-1",
            auto_commit=False,
        )
        self.assertFalse(report.changed)
        self.assertEqual(len(self.engine.graph.facts()), 0)
        pending = self.quid.knowledge_review_queue()
        self.assertEqual(len(pending), 1)
        approved = self.quid.review_knowledge(pending[0].review_id, "approve")
        self.assertEqual(approved.status, "approved")
        self.assertEqual(len(self.engine.graph.facts()), 1)

    def test_source_replacement_removes_obsolete_facts_and_records_diff(self) -> None:
        first = self.quid.acquire_knowledge(
            "O lobo é um animal.",
            source="source",
            document_id="doc",
        )
        old_fact = first.facts[0]
        second = self.quid.acquire_knowledge(
            "O lobo é um predador.",
            source="source",
            document_id="doc",
        )
        self.assertIn(old_fact, second.diff.removed)
        self.assertNotIn(old_fact, self.engine.graph.facts())
        self.assertTrue(any(f.relation == "is_a" and self.engine.quids.get(f.object).label == "predador" for f in second.facts))

    def test_replacing_one_source_preserves_other_sources(self) -> None:
        first = self.quid.acquire_knowledge(
            "O lobo é um animal.",
            source="source-a",
            document_id="doc-a",
        )
        fact_from_a = first.facts[0]
        self.quid.acquire_knowledge(
            "O lobo é um animal.",
            source="source-b",
            document_id="doc-b",
        )
        self.quid.acquire_knowledge(
            "O lobo é um predador.",
            source="source-a",
            document_id="doc-a",
        )
        remaining = self.engine.graph.facts()
        self.assertNotIn(fact_from_a, remaining)
        self.assertTrue(any(f.provenance == "source-b" and f.relation == "is_a" for f in remaining))

    def test_entity_resolution_unifies_accents_without_fuzzy_guessing(self) -> None:
        resolver = self.quid.knowledge.entity_resolver
        joao = resolver.resolve("João")
        joao_variant = resolver.resolve("Joao")
        self.assertEqual(joao.quid, joao_variant.quid)
        unknown = resolver.resolve("entidade completamente nova")
        self.assertEqual(unknown.status, "created")
        self.assertNotEqual(unknown.quid, joao.quid)

    def test_json_document_ingestion(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "knowledge.json"
            path.write_text(
                json.dumps({"text": "O cão é um animal."}, ensure_ascii=False),
                encoding="utf-8",
            )
            report = self.quid.acquire_file(path)
            self.assertEqual(len(report.facts), 1)
            self.assertEqual(report.facts[0].relation, "is_a")

    def test_source_version_increments_on_changed_document(self) -> None:
        first = self.quid.acquire_knowledge(
            "A água é um líquido.",
            source=KnowledgeSource("book"),
            document_id="water",
        )
        second = self.quid.acquire_knowledge(
            "A água é uma substância.",
            source=KnowledgeSource("book"),
            document_id="water",
        )
        self.assertEqual(first.document.source.version, 1)
        self.assertEqual(second.document.source.version, 2)

    def test_identical_document_is_a_no_op(self) -> None:
        first = self.quid.acquire_knowledge(
            "O gato é um animal.",
            source="book",
            document_id="cat",
        )
        second = self.quid.acquire_knowledge(
            "O gato é um animal.",
            source="book",
            document_id="cat",
        )
        self.assertTrue(first.changed)
        self.assertFalse(second.changed)
        self.assertEqual(second.diff.added, ())
        self.assertEqual(second.diff.removed, ())

    def test_unsupported_document_format_fails_explicitly(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "knowledge.pdf"
            path.write_bytes(b"not supported")
            with self.assertRaises(ValueError):
                self.quid.acquire_file(path)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import re
from pathlib import Path
from typing import Iterable, Mapping

from griot_consolidation import ConsolidationReport, KnowledgeConsolidator
from griot_deduplication import DeduplicationReport, SemanticDeduplicator
from griot_engine import BaseLayer, Fact, GRIOT
from griot_entity_resolution import EntityResolution, EntityResolutionReport, EntityResolver
from griot_extraction import ExtractionBatch, ExtractionCandidate, KnowledgeExtractor
from griot_gir import GIR_RELATION_FAMILIES
from griot_promotion import KnowledgeAssessment, KnowledgePromotionEngine
from griot_validation import (
    KnowledgeValidator,
    ValidationIssue,
    ValidationReport,
    ValidationStatus,
    ValidatedCandidate,
)
from griot_versioning import KnowledgeDiff, KnowledgeVersion, KnowledgeVersionStore


@dataclass(frozen=True, slots=True)
class KnowledgeSource:
    source_id: str
    kind: str = "text"
    uri: str | None = None
    title: str | None = None
    version: int = 1
    timestamp: float | None = None
    metadata: Mapping[str, object] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if not self.source_id.strip():
            raise ValueError("source_id must not be empty")
        if self.version <= 0:
            raise ValueError("source version must be positive")
        object.__setattr__(self, "metadata", dict(self.metadata or {}))


@dataclass(frozen=True, slots=True)
class KnowledgeDocument:
    document_id: str
    text: str
    source: KnowledgeSource
    fingerprint: str

    @classmethod
    def from_text(
        cls,
        text: str,
        source: KnowledgeSource,
        *,
        document_id: str | None = None,
    ) -> "KnowledgeDocument":
        if not isinstance(text, str):
            raise TypeError("text must be a string")
        if not text.strip():
            raise ValueError("text must not be empty")
        normalized = re.sub(r"\\s+", " ", text.strip())
        fingerprint = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        stable_id = document_id or source.source_id
        return cls(stable_id, text, source, fingerprint)


@dataclass(frozen=True, slots=True)
class AcquiredEntity:
    surface: str
    quid: str
    label: str
    family_id: int
    confidence: float
    status: str


@dataclass(frozen=True, slots=True)
class AcquiredEvent:
    event_id: str
    relation: str
    subject_quid: str
    object_quid: str
    subject: str
    object: str
    tense: str | None
    aspect: str | None
    modality: str | None
    negated: bool
    evidence: str
    confidence: float


@dataclass(frozen=True, slots=True)
class TemporalExtraction:
    surface: str
    normalized: str
    sentence: str
    confidence: float


@dataclass(frozen=True, slots=True)
class ReviewItem:
    review_id: str
    candidate: ExtractionCandidate
    status: str
    reason: str


@dataclass(frozen=True, slots=True)
class AcquisitionReport:
    document: KnowledgeDocument
    batch: ExtractionBatch
    entities: tuple[AcquiredEntity, ...]
    entity_resolution: EntityResolutionReport
    events: tuple[AcquiredEvent, ...]
    temporals: tuple[TemporalExtraction, ...]
    validation: ValidationReport
    deduplication: DeduplicationReport
    consolidation: ConsolidationReport
    version: KnowledgeVersion | None
    diff: KnowledgeDiff
    review_items: tuple[ReviewItem, ...]
    changed: bool
    replaced_facts: tuple[Fact, ...]

    @property
    def facts(self) -> tuple[Fact, ...]:
        return self.consolidation.committed

    @property
    def quids(self) -> tuple[str, ...]:
        return tuple(sorted(set(self.batch.quids)))

    @property
    def conflicts(self) -> tuple[ValidatedCandidate, ...]:
        return tuple(
            item for item in self.validation.candidates
            if item.status == ValidationStatus.CONFLICT
        )


class KnowledgeAcquisitionEngine:
    """G2 coordinator: source -> structured knowledge -> GRIOT memory.

    The front-end is deterministic and model-free. Existing D1-D8 learning
    primitives are reused, while G2 adds document identity, entity resolution,
    event/temporal extraction, transactional source replacement, review and
    explicit provenance/version tracking.
    """

    TEMPORAL_NORMALIZATION = {
        "ontem": "past",
        "hoje": "present",
        "agora": "present",
        "amanhã": "future",
        "amanha": "future",
        "antes": "relative_before",
        "depois": "relative_after",
        "enquanto": "overlap",
    }

    EVENT_RELATIONS = frozenset({
        "attacks", "eats", "sees", "uses", "builds", "creates",
        "helps", "hurts", "wants", "needs", "knows", "causes",
        "gives",
    })

    def __init__(self, engine: GRIOT) -> None:
        self.engine = engine
        self.extractor = KnowledgeExtractor(engine)
        self.validator = KnowledgeValidator(engine)
        self.deduplicator = SemanticDeduplicator()
        self.consolidator = KnowledgeConsolidator(engine)
        self.entity_resolver = EntityResolver(engine.quids)
        self.promotion = KnowledgePromotionEngine()
        self.versions = KnowledgeVersionStore()
        self._documents: dict[str, KnowledgeDocument] = {}
        self._source_facts: dict[str, set[Fact]] = {}
        self._reviews: dict[str, ReviewItem] = {}
        self._bootstrap_source_index()

    def acquire_text(
        self,
        text: str,
        *,
        source: str | KnowledgeSource,
        document_id: str | None = None,
        auto_commit: bool = True,
        replace: bool = True,
    ) -> AcquisitionReport:
        source_obj = self._source(source)
        stable_document_id = document_id or source_obj.source_id
        previous = self._documents.get(stable_document_id)
        version_number = previous.source.version + 1 if previous is not None else 1
        if source_obj.version == 1 and previous is not None:
            source_obj = KnowledgeSource(
                source_obj.source_id,
                source_obj.kind,
                source_obj.uri,
                source_obj.title,
                version_number,
                source_obj.timestamp,
                source_obj.metadata,
            )

        document = KnowledgeDocument.from_text(
            text,
            source_obj,
            document_id=stable_document_id,
        )
        previous = self._documents.get(document.document_id)
        if previous is not None and previous.fingerprint == document.fingerprint:
            current = self.versions.head
            if current is None:
                current = self.versions.commit(self.engine.graph.facts())
            empty = ConsolidationReport(())
            diff = KnowledgeDiff((), ())
            return AcquisitionReport(
                document,
                self.extractor.extract(text, source=source_obj.source_id),
                (),
                EntityResolutionReport(()),
                (),
                (),
                ValidationReport(text, ()),
                DeduplicationReport(()),
                empty,
                current,
                diff,
                (),
                False,
                (),
            )

        before_facts = tuple(self.engine.graph.facts())
        old_facts = tuple(self._facts_for_document(document.document_id, source_obj.source_id))
        if replace:
            for fact in old_facts:
                self.engine.graph.remove_fact(fact)

        try:
            batch = self.extractor.extract(text, source=source_obj.source_id)
            batch = self._resolve_batch(batch)
            entity_resolution, entities = self._entities(batch)
            events = self._events(batch)
            temporals = self._temporals(batch)

            validation = self.validator.validate(batch)
            deduplication = self.deduplicator.deduplicate(
                item.candidate for item in validation.valid
            )
            effective_validation = self._effective_validation(validation, deduplication)

            review_items: list[ReviewItem] = []
            if auto_commit:
                consolidation = self.consolidator.consolidate(
                    effective_validation,
                    deduplication,
                )
            else:
                consolidation = ConsolidationReport(())

            for item in effective_validation.candidates:
                if item.status in {
                    ValidationStatus.INVALID,
                    ValidationStatus.CONFLICT,
                    ValidationStatus.VALID,
                }:
                    if not auto_commit or item.status in {
                        ValidationStatus.INVALID,
                        ValidationStatus.CONFLICT,
                    }:
                        review = self._queue_review(
                            item.candidate,
                            item.status,
                            self._review_reason(item),
                        )
                        review_items.append(review)

            if not auto_commit:
                self._restore_facts(old_facts)
                version = self._ensure_head(before_facts)
                diff = KnowledgeDiff((), ())
                if previous is not None:
                    self._documents[document.document_id] = previous
                return AcquisitionReport(
                    document, batch, entities, entity_resolution, events, temporals,
                    effective_validation, deduplication, consolidation, version, diff,
                    tuple(review_items), False, old_facts,
                )

            self._documents[document.document_id] = document
            self._source_facts[document.document_id] = {
                fact for fact in self.engine.graph.facts()
                if fact.provenance == source_obj.source_id
            }

            after_facts = tuple(self.engine.graph.facts())
            self._restore_source_index(document.document_id, source_obj.source_id)
            changed = set(before_facts) != set(after_facts)
            version = self._commit_if_changed(before_facts, after_facts)
            diff = self._diff(before_facts, after_facts)
            promotion = self.promotion.assess(after_facts)
            self._discard_resolved_reviews(consolidation.committed)
            return AcquisitionReport(
                document, batch, entities, entity_resolution, events, temporals,
                effective_validation, deduplication, consolidation, version, diff,
                tuple(review_items), changed, old_facts,
            )
        except Exception:
            self._restore_facts(old_facts)
            raise

    def acquire_file(
        self,
        path: str | Path,
        *,
        source: str | KnowledgeSource | None = None,
        document_id: str | None = None,
        auto_commit: bool = True,
        replace: bool = True,
    ) -> AcquisitionReport:
        p = Path(path)
        text = self._read_document_file(p)
        source_value = source or KnowledgeSource(
            source_id=str(p),
            kind=p.suffix.lower().lstrip(".") or "text",
            uri=str(p),
            title=p.name,
        )
        return self.acquire_text(
            text,
            source=source_value,
            document_id=document_id,
            auto_commit=auto_commit,
            replace=replace,
        )

    def acquire_documents(
        self,
        documents: Iterable[KnowledgeDocument],
        *,
        auto_commit: bool = True,
        replace: bool = True,
    ) -> tuple[AcquisitionReport, ...]:
        return tuple(
            self.acquire_text(
                document.text,
                source=document.source,
                document_id=document.document_id,
                auto_commit=auto_commit,
                replace=replace,
            )
            for document in documents
        )

    def learn_stream(
        self,
        items: Iterable[tuple[str, str]],
        *,
        auto_commit: bool = True,
    ) -> tuple[AcquisitionReport, ...]:
        return tuple(
            self.acquire_text(text, source=source, auto_commit=auto_commit)
            for text, source in items
        )

    def review_queue(self) -> tuple[ReviewItem, ...]:
        return tuple(
            item for item in sorted(self._reviews.values(), key=lambda item: item.review_id)
            if item.status == "pending"
        )

    def review(self, review_id: str, decision: str) -> ReviewItem:
        item = self._reviews.get(review_id)
        if item is None:
            raise KeyError("unknown review item")
        if item.status != "pending":
            return item
        decision_key = decision.strip().casefold()
        if decision_key not in {"approve", "reject"}:
            raise ValueError("decision must be approve or reject")

        candidate = item.candidate
        if decision_key == "reject":
            updated = ReviewItem(item.review_id, candidate, "rejected", "human rejection")
            self._reviews[item.review_id] = updated
            return updated

        fact = candidate.fact
        if not self._structurally_valid(fact):
            updated = ReviewItem(
                item.review_id,
                candidate,
                "rejected",
                "human approval cannot bypass malformed knowledge",
            )
            self._reviews[item.review_id] = updated
            return updated

        if fact in self.engine.graph.facts():
            updated = ReviewItem(item.review_id, candidate, "duplicate", "fact already exists")
            self._reviews[item.review_id] = updated
            return updated

        before = tuple(self.engine.graph.facts())
        self.engine.graph.add_fact(fact)
        self._source_facts.setdefault(
            self._document_id_for_source(fact.provenance),
            set(),
        ).add(fact)
        after = tuple(self.engine.graph.facts())
        self._commit_if_changed(before, after)
        self._reviews[item.review_id] = ReviewItem(
            item.review_id,
            candidate,
            "approved",
            "human approval",
        )
        return self._reviews[item.review_id]

    def assess(self) -> tuple[KnowledgeAssessment, ...]:
        return self.promotion.assess(self.engine.graph.facts())

    def document(self, document_id: str) -> KnowledgeDocument | None:
        return self._documents.get(document_id)

    def documents(self) -> tuple[KnowledgeDocument, ...]:
        return tuple(
            self._documents[key]
            for key in sorted(self._documents)
        )

    @property
    def version(self) -> KnowledgeVersion | None:
        return self.versions.head

    # ------------------------------------------------------------------
    # Structured acquisition stages
    # ------------------------------------------------------------------

    def _resolve_batch(self, batch: ExtractionBatch) -> ExtractionBatch:
        resolved_candidates: list[ExtractionCandidate] = []
        for candidate in batch.candidates:
            fact = candidate.fact
            subject = self.entity_resolver.resolve_quid(fact.subject)
            object_ = self.entity_resolver.resolve_quid(fact.object)
            resolved_fact = Fact(
                subject.quid,
                fact.relation,
                object_.quid,
                fact.confidence,
                fact.negated,
                fact.provenance,
                fact.evidence,
                fact.timestamp,
            )
            resolved_candidates.append(
                ExtractionCandidate(
                    resolved_fact,
                    candidate.source_text,
                    candidate.gir_fingerprint,
                    candidate.extraction_confidence,
                )
            )
        return ExtractionBatch(batch.text, batch.gir, tuple(resolved_candidates))

    def _entities(
        self,
        batch: ExtractionBatch,
    ) -> tuple[EntityResolutionReport, tuple[AcquiredEntity, ...]]:
        unique: dict[str, tuple[str, int, float]] = {}
        resolutions: list[EntityResolution] = []
        for node in sorted(batch.gir.nodes, key=lambda item: item.node_id):
            quid = self.engine.quids.get(node.quid)
            if quid is None:
                continue
            resolution = self.entity_resolver.resolve(
                quid.label,
                family_id=quid.family_id,
                base=BaseLayer(quid.base),
            )
            resolutions.append(resolution)
            unique.setdefault(
                resolution.quid,
                (resolution.canonical_label, quid.family_id, node.confidence),
            )
        entities = tuple(
            AcquiredEntity(
                label,
                quid,
                label,
                family,
                confidence,
                "resolved",
            )
            for quid, (label, family, confidence) in sorted(unique.items())
        )
        return EntityResolutionReport(tuple(resolutions)), entities

    def _events(self, batch: ExtractionBatch) -> tuple[AcquiredEvent, ...]:
        language = batch.gir.constraints.get("language", {})
        clauses = language.get("clauses", ()) if isinstance(language, Mapping) else ()
        output: list[AcquiredEvent] = []
        for index, clause in enumerate(clauses):
            if not isinstance(clause, Mapping):
                continue
            relation = clause.get("relation")
            subject = clause.get("subject")
            object_ = clause.get("object")
            if relation not in self.EVENT_RELATIONS or not subject or not object_:
                continue
            subject_r = self.entity_resolver.resolve(str(subject))
            object_r = self.entity_resolver.resolve(str(object_))
            evidence = str(clause.get("text") or batch.text)
            event_key = (
                f"{batch.gir.fingerprint()}\\0{index}\\0{relation}\\0"
                f"{subject_r.quid}\\0{object_r.quid}"
            )
            event_id = hashlib.sha256(event_key.encode("utf-8")).hexdigest()[:20]
            confidence = 0.0
            for candidate in batch.candidates:
                if (
                    candidate.fact.relation == relation
                    and candidate.fact.subject == subject_r.quid
                    and candidate.fact.object == object_r.quid
                ):
                    confidence = max(confidence, candidate.extraction_confidence)
            output.append(
                AcquiredEvent(
                    event_id,
                    str(relation),
                    subject_r.quid,
                    object_r.quid,
                    subject_r.canonical_label,
                    object_r.canonical_label,
                    clause.get("tense"),
                    clause.get("aspect"),
                    clause.get("modality"),
                    bool(clause.get("negated", False)),
                    evidence,
                    confidence or 0.80,
                )
            )
        return tuple(output)

    def _temporals(self, batch: ExtractionBatch) -> tuple[TemporalExtraction, ...]:
        output: list[TemporalExtraction] = []
        language = batch.gir.constraints.get("language", {})
        clauses = language.get("clauses", ()) if isinstance(language, Mapping) else ()
        for clause in clauses:
            if not isinstance(clause, Mapping):
                continue
            sentence = str(clause.get("text") or batch.text)
            for marker in clause.get("temporal", ()) or ():
                normalized = self.TEMPORAL_NORMALIZATION.get(str(marker), str(marker))
                output.append(TemporalExtraction(str(marker), normalized, sentence, 0.90))
        for value in re.findall(r"\\b\\d{4}-\\d{2}-\\d{2}\\b", batch.text):
            output.append(TemporalExtraction(value, "date", batch.text, 0.98))
        for value in re.findall(r"\\b(?:\\d{1,2}\\s+(?:dias?|semanas?|meses?|anos?|anos|horas?|minutos?)\\s+(?:atrás|depois|antes))\\b", batch.text.casefold()):
            output.append(TemporalExtraction(value, "relative_duration", batch.text, 0.82))
        seen = set()
        unique: list[TemporalExtraction] = []
        for item in output:
            key = (item.surface, item.normalized, item.sentence)
            if key not in seen:
                seen.add(key)
                unique.append(item)
        return tuple(unique)

    # ------------------------------------------------------------------
    # Validation, deduplication and review
    # ------------------------------------------------------------------

    @staticmethod
    def _effective_validation(
        validation: ValidationReport,
        deduplication: DeduplicationReport,
    ) -> ValidationReport:
        duplicate_candidates: set[ExtractionCandidate] = set()
        conflict_candidates: set[ExtractionCandidate] = set()
        representatives: set[ExtractionCandidate] = set()

        for group in deduplication.groups:
            items = tuple(group.candidates)
            if group.contradictory:
                conflict_candidates.update(items)
                continue
            representatives.add(group.representative)
            duplicate_candidates.update(
                candidate for candidate in items
                if candidate != group.representative
            )

        effective: list[ValidatedCandidate] = []
        for item in validation.candidates:
            candidate = item.candidate
            if item.status != ValidationStatus.VALID:
                effective.append(item)
                continue
            if candidate in conflict_candidates:
                effective.append(
                    ValidatedCandidate(
                        candidate,
                        ValidationStatus.CONFLICT,
                        (ValidationIssue(
                            "batch-contradiction",
                            "opposite-polarity candidates occur in the same acquisition batch",
                        ),),
                    )
                )
            elif candidate in duplicate_candidates:
                effective.append(
                    ValidatedCandidate(
                        candidate,
                        ValidationStatus.DUPLICATE,
                        (ValidationIssue(
                            "batch-duplicate",
                            "semantically identical candidate was collapsed to a representative",
                        ),),
                    )
                )
            elif candidate in representatives:
                effective.append(item)
        return ValidationReport(validation.source_text, tuple(effective))

    @staticmethod
    def _review_reason(item: ValidatedCandidate) -> str:
        if item.issues:
            return "; ".join(issue.message for issue in item.issues)
        return "candidate requires human review"

    def _queue_review(
        self,
        candidate: ExtractionCandidate,
        status: str,
        reason: str,
    ) -> ReviewItem:
        material = (
            f"{candidate.gir_fingerprint}\\0{candidate.fact.subject}\\0"
            f"{candidate.fact.relation}\\0{candidate.fact.object}\\0"
            f"{candidate.fact.negated}\\0{candidate.fact.provenance}\\0"
            f"{candidate.fact.evidence or ''}"
        )
        review_id = hashlib.sha256(material.encode("utf-8")).hexdigest()[:24]
        existing = self._reviews.get(review_id)
        if existing is not None:
            return existing
        item = ReviewItem(review_id, candidate, "pending", reason)
        self._reviews[review_id] = item
        return item

    @staticmethod
    def _structurally_valid(fact: Fact) -> bool:
        return (
            isinstance(fact.subject, str)
            and len(fact.subject) == 1
            and isinstance(fact.object, str)
            and len(fact.object) == 1
            and fact.relation in GIR_RELATION_FAMILIES
            and 0.0 <= float(fact.confidence) <= 1.0
        )

    def _discard_resolved_reviews(self, facts: Iterable[Fact]) -> None:
        keys = {
            (
                fact.subject,
                fact.relation,
                fact.object,
                fact.negated,
                fact.provenance,
            )
            for fact in facts
        }
        for review_id, item in tuple(self._reviews.items()):
            fact = item.candidate.fact
            if item.status == "pending" and (
                fact.subject,
                fact.relation,
                fact.object,
                fact.negated,
                fact.provenance,
            ) in keys:
                self._reviews.pop(review_id, None)

    # ------------------------------------------------------------------
    # Transaction/source/version helpers
    # ------------------------------------------------------------------

    def _facts_for_document(self, document_id: str, source_id: str) -> tuple[Fact, ...]:
        indexed = self._source_facts.get(document_id)
        if indexed is not None:
            return tuple(indexed)
        return tuple(
            fact for fact in self.engine.graph.facts()
            if fact.provenance == source_id
        )

    def _restore_source_index(self, document_id: str, source_id: str) -> None:
        self._source_facts[document_id] = {
            fact for fact in self.engine.graph.facts()
            if fact.provenance == source_id
        }

    def _restore_facts(self, facts: Iterable[Fact]) -> None:
        for fact in facts:
            self.engine.graph.add_fact(fact)

    def _ensure_head(self, facts: Iterable[Fact]) -> KnowledgeVersion:
        current = self.versions.head
        if current is None:
            return self.versions.commit(facts)
        return current

    def _commit_if_changed(
        self,
        before: Iterable[Fact],
        after: Iterable[Fact],
    ) -> KnowledgeVersion:
        before_set = set(before)
        after_set = set(after)
        current = self.versions.head
        if current is None:
            return self.versions.commit(after_set)
        if before_set == after_set:
            return current
        return self.versions.commit(after_set)

    @staticmethod
    def _diff(before: Iterable[Fact], after: Iterable[Fact]) -> KnowledgeDiff:
        left = set(before)
        right = set(after)
        return KnowledgeDiff(
            tuple(sorted(right - left, key=KnowledgeAcquisitionEngine._fact_key)),
            tuple(sorted(left - right, key=KnowledgeAcquisitionEngine._fact_key)),
        )

    @staticmethod
    def _fact_key(fact: Fact) -> tuple[object, ...]:
        return (
            fact.subject,
            fact.relation,
            fact.object,
            fact.negated,
            fact.confidence,
            fact.provenance,
            fact.evidence or "",
            fact.timestamp or 0.0,
        )

    def _bootstrap_source_index(self) -> None:
        for fact in self.engine.graph.facts():
            self._source_facts.setdefault(fact.provenance, set()).add(fact)

    def _document_id_for_source(self, source_id: str) -> str:
        for document_id, facts in self._source_facts.items():
            if any(fact.provenance == source_id for fact in facts):
                return document_id
        return source_id

    @staticmethod
    def _source(value: str | KnowledgeSource) -> KnowledgeSource:
        if isinstance(value, KnowledgeSource):
            return value
        if not isinstance(value, str) or not value.strip():
            raise ValueError("source must be a non-empty string or KnowledgeSource")
        return KnowledgeSource(value.strip())

    @staticmethod
    def _read_document_file(path: Path) -> str:
        if not path.exists():
            raise FileNotFoundError(str(path))
        suffix = path.suffix.casefold()
        if suffix in {".txt", ".md", ".markdown", ".rst", ".log"}:
            return path.read_text(encoding="utf-8")
        if suffix == ".json":
            payload = json.loads(path.read_text(encoding="utf-8"))
            return KnowledgeAcquisitionEngine._json_text(payload)
        raise ValueError(
            f"unsupported document format {suffix or '<none>'}; "
            "supported: txt, md, markdown, rst, log, json"
        )

    @staticmethod
    def _json_text(payload: object) -> str:
        if isinstance(payload, str):
            return payload
        if isinstance(payload, Mapping):
            for key in ("text", "content", "body"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    return value
            return "\\n".join(
                KnowledgeAcquisitionEngine._json_text(value)
                for value in payload.values()
                if isinstance(value, (Mapping, list, tuple, str)) and KnowledgeAcquisitionEngine._json_text(value).strip()
            )
        if isinstance(payload, (list, tuple)):
            return "\\n".join(
                KnowledgeAcquisitionEngine._json_text(value)
                for value in payload
                if isinstance(value, (Mapping, list, tuple, str))
            )
        return str(payload)

    __all__ = [
        "AcquiredEntity",
        "AcquiredEvent",
        "AcquisitionReport",
        "KnowledgeAcquisitionEngine",
        "KnowledgeDocument",
        "KnowledgeSource",
        "ReviewItem",
        "TemporalExtraction",
    ]

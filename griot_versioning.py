from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from typing import Iterable

from griot_engine import Fact, GRIOT


@dataclass(frozen=True, slots=True)
class KnowledgeDiff:
    added: tuple[Fact, ...]
    removed: tuple[Fact, ...]


@dataclass(frozen=True, slots=True)
class KnowledgeVersion:
    version_id: str
    sequence: int
    parent_version: str | None
    facts: tuple[Fact, ...]

    def canonical_json(self) -> str:
        payload = {
            "version": "1.0",
            "version_id": self.version_id,
            "sequence": self.sequence,
            "parent_version": self.parent_version,
            "facts": [_fact_dict(fact) for fact in self.facts],
        }
        return json.dumps(
            payload,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )

    def diff(self, other: "KnowledgeVersion") -> KnowledgeDiff:
        left = set(self.facts)
        right = set(other.facts)
        return KnowledgeDiff(
            tuple(sorted(right - left, key=_fact_key)),
            tuple(sorted(left - right, key=_fact_key)),
        )


class KnowledgeVersionStore:
    """In-memory immutable history of durable knowledge states."""

    def __init__(self) -> None:
        self._versions: dict[str, KnowledgeVersion] = {}
        self._head: str | None = None

    @property
    def head(self) -> KnowledgeVersion | None:
        return self._versions.get(self._head) if self._head else None

    def commit(self, facts: Iterable[Fact]) -> KnowledgeVersion:
        canonical = tuple(sorted(set(facts), key=_fact_key))
        payload = [_fact_dict(fact) for fact in canonical]
        parent = self._head
        sequence = (self.head.sequence + 1) if self.head else 1
        material = {
            "version": "1.0",
            "parent_version": parent,
            "sequence": sequence,
            "facts": payload,
        }
        version_id = hashlib.sha256(
            json.dumps(
                material,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()

        version = KnowledgeVersion(version_id, sequence, parent, canonical)
        existing = self._versions.get(version_id)
        if existing is not None:
            self._head = version_id
            return existing

        self._versions[version_id] = version
        self._head = version_id
        return version

    def get(self, version_id: str) -> KnowledgeVersion | None:
        return self._versions.get(version_id)

    def history(self) -> tuple[KnowledgeVersion, ...]:
        return tuple(
            sorted(self._versions.values(), key=lambda version: version.sequence)
        )

    def diff(self, from_version: str, to_version: str) -> KnowledgeDiff:
        source = self.get(from_version)
        target = self.get(to_version)
        if source is None or target is None:
            raise KeyError("unknown knowledge version")
        return source.diff(target)


def _fact_key(fact: Fact) -> tuple[object, ...]:
    return (
        fact.subject,
        fact.relation,
        fact.object,
        fact.negated,
        fact.confidence,
        fact.provenance,
        fact.evidence or "",
        fact.timestamp or "",
    )


def _fact_dict(fact: Fact) -> dict[str, object]:
    return {
        "subject": fact.subject,
        "relation": fact.relation,
        "object": fact.object,
        "confidence": fact.confidence,
        "negated": fact.negated,
        "provenance": fact.provenance,
        "evidence": fact.evidence,
        "timestamp": fact.timestamp,
    }


__all__ = ["KnowledgeDiff", "KnowledgeVersion", "KnowledgeVersionStore"]

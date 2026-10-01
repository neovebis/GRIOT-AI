from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable

from griot_engine import Fact


@dataclass(frozen=True, slots=True)
class IndexStats:
    facts: int
    subjects: int
    objects: int
    relations: int
    semantic_keys: int


class FactIndices:
    """In-memory inverted indexes over durable facts."""

    def __init__(self, facts: Iterable[Fact] = ()) -> None:
        self._subject_relation: dict[tuple[str, str], set[Fact]] = defaultdict(set)
        self._object_relation: dict[tuple[str, str], set[Fact]] = defaultdict(set)
        self._relation: dict[str, set[Fact]] = defaultdict(set)
        self._semantic: dict[tuple[str, str, str], set[Fact]] = defaultdict(set)
        self._subject_object: dict[tuple[str, str], set[Fact]] = defaultdict(set)
        self._facts: set[Fact] = set()
        self.rebuild(facts)

    def rebuild(self, facts: Iterable[Fact]) -> None:
        self._subject_relation.clear()
        self._object_relation.clear()
        self._relation.clear()
        self._semantic.clear()
        self._subject_object.clear()
        self._facts.clear()
        for fact in facts:
            self.add(fact)

    def add(self, fact: Fact) -> None:
        if fact in self._facts:
            return
        self._facts.add(fact)
        self._subject_relation[(fact.subject, fact.relation)].add(fact)
        self._object_relation[(fact.object, fact.relation)].add(fact)
        self._relation[fact.relation].add(fact)
        self._semantic[(fact.subject, fact.relation, fact.object)].add(fact)
        self._subject_object[(fact.subject, fact.object)].add(fact)

    def remove(self, fact: Fact) -> None:
        if fact not in self._facts:
            return
        self._facts.remove(fact)
        buckets = (
            (self._subject_relation, (fact.subject, fact.relation)),
            (self._object_relation, (fact.object, fact.relation)),
            (self._relation, fact.relation),
            (self._semantic, (fact.subject, fact.relation, fact.object)),
            (self._subject_object, (fact.subject, fact.object)),
        )
        for mapping, key in buckets:
            values = mapping.get(key)
            if values is None:
                continue
            values.discard(fact)
            if not values:
                mapping.pop(key, None)

    def query(
        self,
        *,
        subject: str | None = None,
        relation: str | None = None,
        object_: str | None = None,
        negated: bool | None = None,
    ) -> tuple[Fact, ...]:
        if subject is not None and relation is not None:
            candidates = self._subject_relation.get((subject, relation), ())
        elif object_ is not None and relation is not None:
            candidates = self._object_relation.get((object_, relation), ())
        elif subject is not None and relation is None and object_ is not None:
            candidates = self._subject_object.get((subject, object_), ())
        elif relation is not None:
            candidates = self._relation.get(relation, ())
        else:
            candidates = self._facts

        result = [
            fact
            for fact in candidates
            if (subject is None or fact.subject == subject)
            and (relation is None or fact.relation == relation)
            and (object_ is None or fact.object == object_)
            and (negated is None or fact.negated == negated)
        ]
        return tuple(sorted(result, key=self._fact_key))

    def exact(self, subject: str, relation: str, object_: str) -> tuple[Fact, ...]:
        return tuple(
            sorted(
                self._semantic.get((subject, relation, object_), ()),
                key=self._fact_key,
            )
        )

    def stats(self) -> IndexStats:
        return IndexStats(
            len(self._facts),
            len({fact.subject for fact in self._facts}),
            len({fact.object for fact in self._facts}),
            len(self._relation),
            len(self._semantic),
        )

    @staticmethod
    def _fact_key(fact: Fact) -> tuple[object, ...]:
        return (
            fact.subject,
            fact.relation,
            fact.object,
            fact.negated,
            fact.provenance,
            fact.confidence,
            fact.evidence or "",
            fact.timestamp or "",
        )


__all__ = ["FactIndices", "IndexStats"]

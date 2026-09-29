from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable


class DiscourseRelation(str, Enum):
    CONTINUATION = "continuation"
    CONTRAST = "contrast"
    CAUSE = "cause"
    CONSEQUENCE = "consequence"
    ELABORATION = "elaboration"
    TEMPORAL_SHIFT = "temporal_shift"
    TOPIC_SHIFT = "topic_shift"
    NONE = "none"


@dataclass(frozen=True, slots=True)
class DiscourseTransition:
    previous_turn: int | None
    current_turn: int
    relation: DiscourseRelation
    confidence: float
    shared_quids: tuple[str, ...]
    previous_topic: tuple[str, ...]
    current_topic: tuple[str, ...]
    markers: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class DiscourseSegment:
    segment_id: int
    start_turn: int
    end_turn: int
    topic_quids: tuple[str, ...]
    reason: DiscourseRelation


@dataclass(frozen=True, slots=True)
class DiscourseState:
    turn: int
    active_segment_id: int | None
    active_topic: tuple[str, ...]
    segments: tuple[DiscourseSegment, ...]
    transition: DiscourseTransition | None


class DiscourseContextEngine:
    """Deterministic discourse-state layer on top of transient context.

    This layer interprets how turns relate to one another. It does not replace
    lexical ambiguity or coreference resolution and it never writes durable
    knowledge.
    """

    MARKERS = {
        DiscourseRelation.CONTRAST: ("mas", "porém", "porem", "contudo", "entretanto"),
        DiscourseRelation.CAUSE: ("porque", "pois", "já que", "ja que", "devido a"),
        DiscourseRelation.CONSEQUENCE: ("portanto", "logo", "assim", "por isso"),
        DiscourseRelation.ELABORATION: ("também", "tambem", "além disso", "alem disso", "ainda"),
        DiscourseRelation.TEMPORAL_SHIFT: ("depois", "antes", "agora", "então", "entao", "enquanto"),
    }

    def __init__(self, max_segments: int = 32) -> None:
        if not isinstance(max_segments, int) or isinstance(max_segments, bool) or max_segments <= 0:
            raise ValueError("max_segments must be a positive integer")
        self.max_segments = max_segments
        self._segments: list[DiscourseSegment] = []
        self._turn = 0
        self._active_segment_id: int | None = None
        self._last_transition: DiscourseTransition | None = None

    @property
    def turn(self) -> int:
        return self._turn

    def clear(self) -> None:
        self._segments.clear()
        self._turn = 0
        self._active_segment_id = None
        self._last_transition = None

    def observe(
        self,
        text: str,
        gir: object,
        *,
        previous_records: Iterable[object] = (),
    ) -> DiscourseState:
        if not isinstance(text, str):
            raise TypeError("text must be a string")
        if not hasattr(gir, "validate") or not hasattr(gir, "nodes"):
            raise TypeError("gir must be a GIR-compatible object")
        gir.validate()

        self._turn += 1
        current_topic = self._topic_from_gir(gir)
        previous = tuple(previous_records)
        previous_record = previous[-1] if previous else None
        previous_turn = getattr(previous_record, "turn", None)

        previous_topic = self._topic_from_record(previous_record)
        shared = tuple(sorted(set(current_topic) & set(previous_topic)))
        overlap = self._overlap(current_topic, previous_topic)
        anchor_shared = self._shared_subject(gir, previous_record)
        markers = self._markers(text)
        relation, confidence = self._classify(
            overlap, markers, bool(previous_topic), anchor_shared
        )

        if not self._segments or relation is DiscourseRelation.TOPIC_SHIFT:
            segment_id = (self._segments[-1].segment_id + 1) if self._segments else 1
            segment = DiscourseSegment(
                segment_id,
                self._turn,
                self._turn,
                current_topic,
                relation,
            )
            self._segments.append(segment)
            self._active_segment_id = segment_id
        else:
            current = self._segments[-1]
            updated = DiscourseSegment(
                current.segment_id,
                current.start_turn,
                self._turn,
                current_topic or current.topic_quids,
                relation if relation is not DiscourseRelation.NONE else current.reason,
            )
            self._segments[-1] = updated

        if len(self._segments) > self.max_segments:
            self._segments = self._segments[-self.max_segments :]
            self._active_segment_id = self._segments[-1].segment_id

        self._last_transition = DiscourseTransition(
            previous_turn,
            self._turn,
            relation,
            confidence,
            shared,
            previous_topic,
            current_topic,
            markers,
        )
        return self.state()

    def state(self) -> DiscourseState:
        return DiscourseState(
            self._turn,
            self._active_segment_id,
            self._segments[-1].topic_quids if self._segments else (),
            tuple(self._segments),
            self._last_transition,
        )

    @staticmethod
    def _topic_from_gir(gir: object) -> tuple[str, ...]:
        nodes = getattr(gir, "nodes", ())
        # Prefer ontology/event nodes with higher confidence; retain up to six.
        ranked = sorted(
            nodes,
            key=lambda node: (-float(getattr(node, "confidence", 0.0)), str(getattr(node, "surface", ""))),
        )
        out: list[str] = []
        for node in ranked:
            quid = getattr(node, "quid", None)
            if isinstance(quid, str) and quid not in out:
                out.append(quid)
            if len(out) >= 6:
                break
        return tuple(out)

    @staticmethod
    def _topic_from_record(record: object | None) -> tuple[str, ...]:
        if record is None:
            return ()
        gir = getattr(record, "gir", None)
        if gir is None:
            return ()
        return DiscourseContextEngine._topic_from_gir(gir)

    @staticmethod
    def _overlap(current: tuple[str, ...], previous: tuple[str, ...]) -> float:
        if not current or not previous:
            return 0.0
        union = set(current) | set(previous)
        return len(set(current) & set(previous)) / len(union)

    @classmethod
    def _markers(cls, text: str) -> tuple[str, ...]:
        lowered = text.casefold()
        found: list[str] = []
        for phrases in cls.MARKERS.values():
            for phrase in phrases:
                if phrase in lowered:
                    found.append(phrase)
        return tuple(sorted(set(found), key=lambda value: (len(value), value)))

    @staticmethod
    def _shared_subject(gir: object, previous_record: object | None) -> bool:
        if previous_record is None:
            return False
        current_subjects: set[str] = set()
        current_nodes = {node.node_id: node for node in getattr(gir, "nodes", ())}
        for edge in getattr(gir, "edges", ()):
            if getattr(edge, "relation", None) in {"is_a", "part_of", "member_of", "has", "causes", "located_in"}:
                node = current_nodes.get(getattr(edge, "source", ""))
                if node is not None:
                    current_subjects.add(getattr(node, "quid", ""))
        previous_gir = getattr(previous_record, "gir", None)
        if previous_gir is None:
            return False
        previous_nodes = {node.node_id: node for node in getattr(previous_gir, "nodes", ())}
        previous_subjects = {
            getattr(previous_nodes.get(getattr(edge, "source", "")), "quid", "")
            for edge in getattr(previous_gir, "edges", ())
            if getattr(edge, "relation", None) in {"is_a", "part_of", "member_of", "has", "causes", "located_in"}
            and previous_nodes.get(getattr(edge, "source", "")) is not None
        }
        return bool(current_subjects & previous_subjects)

    @classmethod
    def _classify(
        cls,
        overlap: float,
        markers: tuple[str, ...],
        has_previous: bool,
        anchor_shared: bool = False,
    ) -> tuple[DiscourseRelation, float]:
        if not has_previous:
            return DiscourseRelation.NONE, 1.0
        if markers:
            lowered_markers = set(markers)
            for relation, phrases in cls.MARKERS.items():
                if lowered_markers & set(phrases):
                    return relation, 0.90
        if anchor_shared:
            return DiscourseRelation.CONTINUATION, 0.86
        if overlap >= 0.50:
            return DiscourseRelation.CONTINUATION, 0.82
        if overlap <= 0.40:
            return DiscourseRelation.TOPIC_SHIFT, 0.88
        return DiscourseRelation.CONTINUATION, 0.66


__all__ = [
    "DiscourseContextEngine",
    "DiscourseRelation",
    "DiscourseSegment",
    "DiscourseState",
    "DiscourseTransition",
]

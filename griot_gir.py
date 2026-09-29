from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Mapping

from griot_engine import Fact, SemanticFrame


GIR_FORMAT = "griot-gir"
GIR_SCHEMA_VERSION = "1.0"

# The family attached to an edge is part of the GIR contract. Known relations
# have a canonical family; unknown relations remain extensible but must still
# carry an explicit family_id in the valid 1..10 range.
GIR_RELATION_FAMILIES: dict[str, int] = {
    "is_a": 1,
    "part_of": 2,
    "member_of": 2,
    "has": 2,
    "contains": 2,
    "causes": 6,
    "before": 8,
    "after": 8,
    "located_in": 8,
    "attacks": 4,
    "eats": 4,
    "sees": 4,
    "uses": 4,
    "builds": 4,
    "creates": 4,
    "helps": 4,
    "hurts": 4,
    "wants": 9,
    "needs": 9,
    "knows": 10,
    "believes": 10,
    "has_agent": 9,
    "has_patient": 4,
    "temporal": 8,
    "modal": 7,
    "has_value": 3,
    "composed_of": 2,
}


@dataclass(frozen=True, slots=True)
class MeaningNode:
    node_id: str
    quid: str
    surface: str
    kind: str
    family_id: int
    confidence: float = 1.0


@dataclass(frozen=True, slots=True)
class MeaningEdge:
    source: str
    relation: str
    target: str
    family_id: int
    confidence: float = 1.0
    negated: bool = False
    evidence: str | None = None
    provenance: str | None = None


def _freeze(value: object) -> object:
    if isinstance(value, Mapping):
        return MappingProxyType({str(k): _freeze(v) for k, v in value.items()})
    if isinstance(value, (list, tuple)):
        return tuple(_freeze(v) for v in value)
    return value


def _json_safe(value: object, path: str = "value") -> object:
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError(f"{path} contains a non-finite number")
        return value
    if isinstance(value, Mapping):
        return {str(k): _json_safe(v, f"{path}.{k}") for k, v in sorted(value.items(), key=lambda item: str(item[0]))}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v, f"{path}[{i}]") for i, v in enumerate(value)]
    raise TypeError(f"{path} contains unsupported value type: {type(value).__name__}")


@dataclass(frozen=True, slots=True)
class GIR:
    """Formal GRIOT Intermediate Representation contract.

    GIR is the executable semantic contract shared by semantic compilation,
    QUID resolution and proof-oriented reasoning. Its wire form is versioned
    and deterministic; storage is deliberately kept separate from QUID
    identity and from the durable knowledge graph.
    """

    text: str
    frame: SemanticFrame
    nodes: tuple[MeaningNode, ...]
    edges: tuple[MeaningEdge, ...]
    vector: tuple[float, ...]
    constraints: Mapping[str, object]
    schema_version: str = GIR_SCHEMA_VERSION
    provenance: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "nodes", tuple(self.nodes))
        object.__setattr__(self, "edges", tuple(self.edges))
        object.__setattr__(self, "vector", tuple(float(v) for v in self.vector))
        object.__setattr__(self, "constraints", _freeze(dict(self.constraints)))
        object.__setattr__(self, "provenance", tuple(self.provenance))
        self.validate()

    def validate(self) -> None:
        if not isinstance(self.text, str):
            raise TypeError("GIR.text must be a string")
        if not self.text.strip():
            raise ValueError("GIR.text must not be empty")
        if not isinstance(self.frame, SemanticFrame):
            raise TypeError("GIR.frame must be a SemanticFrame")
        if self.schema_version != GIR_SCHEMA_VERSION:
            raise ValueError(f"unsupported GIR schema_version: {self.schema_version!r}")
        self._validate_confidence(self.frame.confidence, "frame.confidence")
        if not isinstance(self.frame.intent, str) or not self.frame.intent.strip():
            raise ValueError("GIR.frame.intent must be non-empty")
        if self.frame.polarity not in {"positive", "negative"}:
            raise ValueError("GIR.frame.polarity must be positive or negative")

        node_ids: set[str] = set()
        for node in self.nodes:
            if not isinstance(node, MeaningNode):
                raise TypeError("GIR.nodes must contain MeaningNode values")
            if not node.node_id or node.node_id in node_ids:
                raise ValueError("GIR node_id values must be non-empty and unique")
            node_ids.add(node.node_id)
            if not isinstance(node.quid, str) or len(node.quid) != 1:
                raise ValueError("GIR node QUID references must contain exactly one Unicode code point")
            if not isinstance(node.surface, str) or not node.surface.strip():
                raise ValueError("GIR node surface must be non-empty")
            if not isinstance(node.kind, str) or not node.kind.strip():
                raise ValueError("GIR node kind must be non-empty")
            self._validate_family(node.family_id, "node.family_id")
            self._validate_confidence(node.confidence, "node.confidence")

        for edge in self.edges:
            if not isinstance(edge, MeaningEdge):
                raise TypeError("GIR.edges must contain MeaningEdge values")
            if edge.source not in node_ids or edge.target not in node_ids:
                raise ValueError("GIR edge references an unknown node_id")
            if not isinstance(edge.relation, str) or not edge.relation.strip():
                raise ValueError("GIR edge relation must be non-empty")
            self._validate_family(edge.family_id, "edge.family_id")
            expected_family = GIR_RELATION_FAMILIES.get(edge.relation)
            if expected_family is not None and expected_family != edge.family_id:
                raise ValueError(
                    f"GIR relation {edge.relation!r} belongs to family {expected_family}, "
                    f"not {edge.family_id}"
                )
            self._validate_confidence(edge.confidence, "edge.confidence")
            if edge.evidence is not None and not isinstance(edge.evidence, str):
                raise TypeError("GIR edge evidence must be a string or None")
            if edge.provenance is not None and not isinstance(edge.provenance, str):
                raise TypeError("GIR edge provenance must be a string or None")

        for index, value in enumerate(self.vector):
            if not math.isfinite(value):
                raise ValueError(f"GIR.vector[{index}] must be finite")

        _json_safe(self.constraints, "GIR.constraints")
        if any(not isinstance(p, str) or not p.strip() for p in self.provenance):
            raise ValueError("GIR.provenance values must be non-empty strings")

    @staticmethod
    def _validate_family(value: object, field: str) -> None:
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 10:
            raise ValueError(f"{field} must be an integer in 1..10")

    @staticmethod
    def _validate_confidence(value: object, field: str) -> None:
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(float(value)):
            raise ValueError(f"{field} must be finite")
        if not 0.0 <= float(value) <= 1.0:
            raise ValueError(f"{field} must be in 0..1")

    def facts(self) -> tuple[Fact, ...]:
        nodes = {node.node_id: node for node in self.nodes}
        default_provenance = self.provenance[0] if self.provenance else "semantic-ir"
        return tuple(
            Fact(
                nodes[edge.source].quid,
                edge.relation,
                nodes[edge.target].quid,
                edge.confidence,
                edge.negated,
                edge.provenance or default_provenance,
                edge.evidence,
            )
            for edge in self.edges
        )

    def to_dict(self) -> dict[str, Any]:
        self.validate()
        return {
            "format": GIR_FORMAT,
            "schema_version": self.schema_version,
            "text": self.text,
            "frame": {
                "intent": self.frame.intent,
                "confidence": self.frame.confidence,
                "tokens": list(self.frame.tokens),
                "entities": list(self.frame.entities),
                "operations": list(self.frame.operations),
                "constraints": _json_safe(self.frame.constraints, "frame.constraints"),
                "polarity": self.frame.polarity,
            },
            "nodes": [
                {
                    "node_id": node.node_id,
                    "quid": node.quid,
                    "surface": node.surface,
                    "kind": node.kind,
                    "family_id": node.family_id,
                    "confidence": node.confidence,
                }
                for node in sorted(self.nodes, key=lambda n: n.node_id)
            ],
            "edges": [
                {
                    "source": edge.source,
                    "relation": edge.relation,
                    "target": edge.target,
                    "family_id": edge.family_id,
                    "confidence": edge.confidence,
                    "negated": edge.negated,
                    "evidence": edge.evidence,
                    "provenance": edge.provenance,
                }
                for edge in sorted(
                    self.edges,
                    key=lambda e: (e.source, e.relation, e.target, e.negated, e.family_id),
                )
            ],
            "vector": list(self.vector),
            "constraints": _json_safe(self.constraints, "GIR.constraints"),
            "provenance": list(self.provenance),
        }

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "GIR":
        if not isinstance(payload, Mapping):
            raise TypeError("GIR payload must be a mapping")
        if payload.get("format") != GIR_FORMAT:
            raise ValueError("invalid GIR format")
        if payload.get("schema_version") != GIR_SCHEMA_VERSION:
            raise ValueError("unsupported GIR schema_version")

        raw_frame = payload.get("frame")
        if not isinstance(raw_frame, Mapping):
            raise ValueError("GIR.frame is required")
        frame = SemanticFrame(
            str(raw_frame["intent"]),
            float(raw_frame["confidence"]),
            tuple(str(x) for x in raw_frame.get("tokens", ())),
            tuple(str(x) for x in raw_frame.get("entities", ())),
            tuple(str(x) for x in raw_frame.get("operations", ())),
            _freeze(raw_frame.get("constraints", {})),
            str(raw_frame.get("polarity", "positive")),
        )

        raw_nodes = payload.get("nodes", ())
        raw_edges = payload.get("edges", ())
        if not isinstance(raw_nodes, (list, tuple)) or not isinstance(raw_edges, (list, tuple)):
            raise TypeError("GIR.nodes and GIR.edges must be arrays")

        nodes = tuple(
            MeaningNode(
                str(raw["node_id"]),
                str(raw["quid"]),
                str(raw["surface"]),
                str(raw["kind"]),
                int(raw["family_id"]),
                float(raw.get("confidence", 1.0)),
            )
            for raw in raw_nodes
        )
        edges = tuple(
            MeaningEdge(
                str(raw["source"]),
                str(raw["relation"]),
                str(raw["target"]),
                int(raw["family_id"]),
                float(raw.get("confidence", 1.0)),
                bool(raw.get("negated", False)),
                raw.get("evidence"),
                raw.get("provenance"),
            )
            for raw in raw_edges
        )
        return cls(
            str(payload["text"]),
            frame,
            nodes,
            edges,
            tuple(float(x) for x in payload.get("vector", ())),
            _freeze(payload.get("constraints", {})),
            str(payload.get("schema_version")),
            tuple(str(x) for x in payload.get("provenance", ())),
        )

    def canonical_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)

    def to_json(self, *, indent: int | None = None) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, sort_keys=True, indent=indent, allow_nan=False)

    @classmethod
    def from_json(cls, payload: str) -> "GIR":
        if not isinstance(payload, str):
            raise TypeError("GIR JSON payload must be a string")
        try:
            decoded = json.loads(payload)
        except json.JSONDecodeError as exc:
            raise ValueError("invalid GIR JSON") from exc
        return cls.from_dict(decoded)

    def fingerprint(self) -> str:
        return hashlib.sha256(self.canonical_json().encode("utf-8")).hexdigest()


__all__ = [
    "GIR",
    "GIR_FORMAT",
    "GIR_RELATION_FAMILIES",
    "GIR_SCHEMA_VERSION",
    "MeaningEdge",
    "MeaningNode",
]

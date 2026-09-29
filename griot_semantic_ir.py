from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass
from typing import Iterable, Mapping

try:
    from griot_engine import BaseLayer, Fact, GRIOT
except ImportError:
    from griot.types import BaseLayer, Fact
    from griot.engine import GRIOT

from griot_gir import GIR, GIR_RELATION_FAMILIES, MeaningEdge, MeaningNode


@dataclass(frozen=True, slots=True)
class MeaningRepresentation(GIR):
    """Compatibility name for the formal GIR semantic representation.

    Existing semantic callers keep the MeaningRepresentation API while the
    underlying object now satisfies the versioned GIR contract.
    """


class MeaningCompiler:
    RELATION_FAMILY = GIR_RELATION_FAMILIES
    STATEMENTS = (
        (r"^(.*?)\s+faz parte (?:de|do|da|dos|das)\s+(.*?)$", "part_of"),
        (r"^(.*?)\s+pertence a\s+(.*?)$", "member_of"),
        (r"^(.*?)\s+é um\s+(.*?)$", "is_a"),
        (r"^(.*?)\s+é uma\s+(.*?)$", "is_a"),
        (r"^(.*?)\s+tem\s+(.*?)$", "has"),
        (r"^(.*?)\s+possui\s+(.*?)$", "has"),
        (r"^(.*?)\s+causa\s+(.*?)$", "causes"),
        (r"^(.*?)\s+provoca\s+(.*?)$", "causes"),
        (r"^(.*?)\s+antes de\s+(.*?)$", "before"),
        (r"^(.*?)\s+depois de\s+(.*?)$", "after"),
        (r"^(.*?)\s+(?:está|esta|fica|vive) em\s+(.*?)$", "located_in"),
    )
    VERBS = (
        (r"^(.*?)\s+(?:ataca|atacou|atacar)\s+(.*?)$", "attacks"),
        (r"^(.*?)\s+(?:come|comeu|comer)\s+(.*?)$", "eats"),
        (r"^(.*?)\s+(?:vê|ve|viu|ver)\s+(.*?)$", "sees"),
        (r"^(.*?)\s+(?:usa|usou|usar)\s+(.*?)$", "uses"),
        (r"^(.*?)\s+(?:constrói|construiu|construir)\s+(.*?)$", "builds"),
        (r"^(.*?)\s+(?:cria|criou|criar)\s+(.*?)$", "creates"),
        (r"^(.*?)\s+(?:ajuda|ajudou|ajudar)\s+(.*?)$", "helps"),
        (r"^(.*?)\s+(?:fere|feriu|ferir)\s+(.*?)$", "hurts"),
        (r"^(.*?)\s+(?:quer|queria|querer)\s+(.*?)$", "wants"),
        (r"^(.*?)\s+(?:precisa|precisou|precisar)\s+(.*?)$", "needs"),
        (r"^(.*?)\s+(?:sabe|soube|saber)\s+(.*?)$", "knows"),
    )
    MODAL_ACTIONS = ("pode", "deve", "precisa")
    TEMPORAL = {"ontem": "past", "hoje": "present", "agora": "present", "amanhã": "future"}

    def __init__(self, griot: GRIOT) -> None:
        self.griot = griot

    @staticmethod
    def normalize(text: str) -> str:
        value = unicodedata.normalize("NFKC", text).casefold().strip()
        return re.sub(r"\s+", " ", re.sub(r"[!?;:]+", " ", value))

    @staticmethod
    def clean(value: str) -> str:
        value = re.sub(r"^(um|uma|uns|umas|o|a|os|as)\s+", "", value.strip())
        return value.strip(" ,.")

    def compile(self, text: str) -> MeaningRepresentation:
        if not isinstance(text, str):
            raise TypeError("text must be a string")
        normalized = self.normalize(text)
        if not normalized:
            raise ValueError("text must not be empty")

        frame = self.griot.understand(normalized)
        nodes: dict[str, MeaningNode] = {}
        edges: list[MeaningEdge] = []
        last_subject: str | None = None

        for sentence in (x.strip() for x in re.split(r"[.!?]+", normalized) if x.strip()):
            negated = bool(re.search(r"\b(?:não|nunca|jamais)\b", sentence))
            sentence_clean = re.sub(r"\b(?:não|nunca|jamais)\b\s*", "", sentence, count=1).strip()
            pronoun = re.match(r"^(ele|ela|eles|elas|isso|isto|este|esta|esse|essa)\s+(.*)$", sentence_clean)
            if pronoun and last_subject:
                sentence_clean = f"{last_subject} {pronoun.group(2)}"
            parsed = self._parse(sentence_clean)
            if not parsed:
                continue
            subject, relation, object_ = parsed
            subject, object_ = self.clean(subject), self.clean(self._clean_object(object_))
            if not subject or not object_:
                continue
            s = self._node(nodes, subject, "entity", 1)
            o = self._node(nodes, object_, "entity", 1)
            last_subject = subject
            if relation in {"attacks", "eats", "sees", "uses", "builds", "creates", "helps", "hurts", "wants", "needs", "knows"}:
                scene = self._event(nodes, relation, subject, object_)
                edges += [
                    MeaningEdge(scene.node_id, "has_agent", s.node_id, 9, 0.94, negated, sentence),
                    MeaningEdge(scene.node_id, "has_patient", o.node_id, 4, 0.94, negated, sentence),
                ]
            edges.append(
                MeaningEdge(
                    s.node_id,
                    relation,
                    o.node_id,
                    self.RELATION_FAMILY.get(relation, 2),
                    0.92,
                    negated,
                    sentence,
                )
            )
            self._constraints(nodes, edges, s, sentence)

        vector = self._compose_vector(nodes, edges)
        constraints = {
            "numbers": tuple(float(x.replace(",", ".")) for x in re.findall(r"-?\d+(?:[\.,]\d+)?", normalized)),
            "negated": bool(re.search(r"\b(?:não|nunca|jamais)\b", normalized)),
            "temporal": tuple(v for k, v in self.TEMPORAL.items() if k in normalized),
        }
        return MeaningRepresentation(
            text,
            frame,
            tuple(nodes.values()),
            tuple(self._dedupe(edges)),
            vector,
            constraints,
            provenance=("semantic-compiler",),
        )

    def _parse(self, sentence: str) -> tuple[str, str, str] | None:
        modal = re.match(r"^(.*?)\s+(?:pode|deve|precisa)\s+(.+)$", sentence, re.I)
        candidate = f"{modal.group(1)} {modal.group(2)}" if modal else sentence
        for pattern, relation in self.STATEMENTS + self.VERBS:
            match = re.match(pattern, candidate, re.I)
            if match:
                return match.group(1), relation, match.group(2)
        return None

    @staticmethod
    def _clean_object(value: str) -> str:
        return re.sub(r"\s+(?:ontem|hoje|agora|amanhã)$", "", value.strip(), flags=re.I)

    def _node(self, nodes: dict[str, MeaningNode], surface: str, kind: str, family: int) -> MeaningNode:
        q = self.griot.quids.get(surface) or self.griot.quids.ensure(surface, base=BaseLayer.RICH, family_id=family)
        node_id = f"q:{q.symbol}"
        if node_id not in nodes:
            nodes[node_id] = MeaningNode(node_id, q.symbol, surface, kind, q.family_id, 1.0)
        return nodes[node_id]

    def _event(self, nodes: dict[str, MeaningNode], relation: str, subject: str, object_: str) -> MeaningNode:
        label = f"event:{relation}:{subject}:{object_}"
        q = self.griot.quids.ensure(label, base=BaseLayer.SCENE, family_id=4)
        node = MeaningNode(f"s:{q.symbol}", q.symbol, relation, "event", 4, 0.95)
        nodes.setdefault(node.node_id, node)
        return nodes[node.node_id]

    def _constraints(self, nodes: dict[str, MeaningNode], edges: list[MeaningEdge], node: MeaningNode, sentence: str) -> None:
        for word, value in self.TEMPORAL.items():
            if word in sentence:
                q = self.griot.quids.ensure(value, base=BaseLayer.FOUNDATION, family_id=8)
                t = MeaningNode(f"t:{value}", q.symbol, value, "temporal", 8, 0.9)
                nodes.setdefault(t.node_id, t)
                edges.append(MeaningEdge(node.node_id, "temporal", t.node_id, 8, 0.85, evidence=sentence))
        for modal in self.MODAL_ACTIONS:
            if re.search(rf"\b{modal}\b", sentence):
                q = self.griot.quids.ensure(modal, base=BaseLayer.FOUNDATION, family_id=7)
                m = MeaningNode(f"m:{modal}", q.symbol, modal, "modality", 7, 0.9)
                nodes.setdefault(m.node_id, m)
                edges.append(MeaningEdge(node.node_id, "modal", m.node_id, 7, 0.86, evidence=sentence))
        number = re.search(r"-?\d+(?:[\.,]\d+)?", sentence)
        if number:
            raw = number.group(0).replace(",", ".")
            q = self.griot.quids.ensure(f"number:{raw}", base=BaseLayer.RICH, family_id=3)
            n = MeaningNode(f"n:{raw}", q.symbol, raw, "numeric", 3, 0.99)
            nodes.setdefault(n.node_id, n)
            edges.append(MeaningEdge(node.node_id, "has_value", n.node_id, 3, 0.98, evidence=sentence))

    def _compose_vector(self, nodes: Mapping[str, MeaningNode], edges: Iterable[MeaningEdge]) -> tuple[float, ...]:
        vectors: list[tuple[tuple[float, ...], float]] = []
        for node in nodes.values():
            q = self.griot.quids.get(node.quid)
            if q:
                vectors.append((q.signature, node.confidence))
        kernel = self.griot.kernel if hasattr(self.griot, "kernel") else self.griot.numeric
        for edge in edges:
            vectors.append((kernel.signature(edge.relation, edge.family_id, BaseLayer.PRIMITIVE.value), edge.confidence * 0.7))
        return kernel.weighted_sum(vectors)

    @staticmethod
    def _dedupe(edges: Iterable[MeaningEdge]) -> list[MeaningEdge]:
        seen: set[tuple[str, str, str, bool]] = set()
        out: list[MeaningEdge] = []
        for edge in edges:
            key = (edge.source, edge.relation, edge.target, edge.negated)
            if key not in seen:
                seen.add(key)
                out.append(edge)
        return out


class SemanticGRIOT:
    def __init__(self, griot: GRIOT | None = None) -> None:
        self.engine = griot or (GRIOT.create() if hasattr(GRIOT, "create") else GRIOT())
        self.compiler = MeaningCompiler(self.engine)

    def understand(self, text: str) -> MeaningRepresentation:
        return self.compiler.compile(text)

    def learn(self, text: str, source: str = "text") -> int:
        meaning = self.understand(text)
        added = 0
        for fact in meaning.facts():
            self.engine.graph.add_fact(
                Fact(
                    fact.subject,
                    fact.relation,
                    fact.object,
                    fact.confidence,
                    fact.negated,
                    source,
                    fact.evidence,
                )
            )
            added += 1
        return added

    def meaning_similarity(self, a: str, b: str) -> float:
        va, vb = self.understand(a).vector, self.understand(b).vector
        kernel = self.engine.kernel if hasattr(self.engine, "kernel") else self.engine.numeric
        return kernel.cosine(va, vb) if va and vb else 0.0


__all__ = [
    "GIR",
    "MeaningEdge",
    "MeaningNode",
    "MeaningRepresentation",
    "MeaningCompiler",
    "SemanticGRIOT",
]

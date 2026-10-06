from __future__ import annotations

from dataclasses import asdict, dataclass
import math
import re
from typing import Any, Iterable, Mapping
import unicodedata

try:
    from griot_engine import BaseLayer, Fact, GRIOT, SemanticFrame
except ImportError:
    from griot.types import BaseLayer, Fact, SemanticFrame
    from griot.engine import GRIOT


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


@dataclass(frozen=True, slots=True)
class MeaningRepresentation:
    text: str
    frame: SemanticFrame
    nodes: tuple[MeaningNode, ...]
    edges: tuple[MeaningEdge, ...]
    vector: tuple[float, ...]
    constraints: Mapping[str, object]

    def facts(self) -> tuple[Fact, ...]:
        index = {n.node_id: n for n in self.nodes}
        return tuple(
            Fact(
                index[e.source].quid,
                e.relation,
                index[e.target].quid,
                e.confidence,
                e.negated,
                "semantic-ir",
                e.evidence,
            )
            for e in self.edges
            if e.source in index and e.target in index
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "frame": asdict(self.frame) if hasattr(self.frame, "__dataclass_fields__") else self.frame,
            "nodes": [asdict(n) for n in self.nodes],
            "edges": [asdict(e) for e in self.edges],
            "vector": list(self.vector),
            "constraints": dict(self.constraints),
        }


class MeaningCompiler:
    RELATION_FAMILY = {
        "is_a": 1,
        "part_of": 2,
        "member_of": 2,
        "has": 2,
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
    }
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

    GENDER_MAP = {
        "cão": ("masc", "sing"),
        "lobo": ("masc", "sing"),
        "urso": ("masc", "sing"),
        "leão": ("masc", "sing"),
        "casa": ("fem", "sing"),
        "floresta": ("fem", "sing"),
        "carne": ("fem", "sing"),
        "madeira": ("fem", "sing"),
        "animais": ("masc", "plur"),
        "casas": ("fem", "plur"),
        "árvores": ("fem", "plur"),
    }

    def __init__(self, griot: GRIOT) -> None:
        self.griot = griot

    @staticmethod
    def normalize(text: str) -> str:
        value = unicodedata.normalize("NFKC", text).casefold().strip()
        return re.sub(r"\s+", " ", re.sub(r"[!?;:]+", " ", value))

    @staticmethod
    def clean(value: str) -> str:
        value = re.sub(r"^(um|uma|uns|umas|o|a|os|as)\s+", "", value.strip(), flags=re.I)
        return value.strip(" ,.")

    def _get_gender_number(self, word: str) -> tuple[str, str]:
        w = word.lower().strip()
        if w in self.GENDER_MAP:
            return self.GENDER_MAP[w]
        num = "plur" if w.endswith("s") else "sing"
        gen = "fem" if w.endswith("a") or w.endswith("as") else "masc"
        return gen, num

    def compile(self, text: str) -> MeaningRepresentation:
        normalized = self.normalize(text)
        frame = self.griot.understand(normalized)
        nodes: dict[str, MeaningNode] = {}
        edges: list[MeaningEdge] = []

        try:
            from griot_language import LanguageIntelligence
            lang_intel = LanguageIntelligence()
            analysis = lang_intel.analyze(text)
            lang_clauses = list(analysis.clauses)
        except Exception:
            lang_clauses = []

        coref_links: list[dict[str, Any]] = []
        prior_entities: list[str] = []
        prior_subjects: list[str] = []
        processed_clauses: list[dict[str, Any]] = []

        if lang_clauses:
            for clause in lang_clauses:
                clause_dict = asdict(clause)
                if clause.subject and clause.subject.lower() in {"ele", "ela", "eles", "elas"}:
                    pron_lower = clause.subject.lower()
                    target_gen = "fem" if pron_lower in {"ela", "elas"} else "masc"
                    target_num = "plur" if pron_lower in {"eles", "elas"} else "sing"
                    subj_candidates = [e for e in prior_subjects if self._get_gender_number(e) == (target_gen, target_num)]
                    if not subj_candidates:
                        subj_candidates = [e for e in prior_entities if self._get_gender_number(e) == (target_gen, target_num)]
                    if subj_candidates:
                        clause_dict["subject"] = subj_candidates[-1]

                marker = clause.clitic_marker
                if not marker and clause.object in {"ele", "ela", "eles", "elas"}:
                    marker = clause.object

                if marker:
                    marker_lower = marker.lower()
                    target_gen = "fem" if marker_lower in {"a", "la", "as", "las", "ela", "elas"} else "masc"
                    target_num = "plur" if marker_lower in {"os", "los", "as", "las", "eles", "elas"} else "sing"

                    candidates = [e for e in prior_entities if self._get_gender_number(e) == (target_gen, target_num)]
                    unique_candidates: list[str] = []
                    for c in candidates:
                        if c not in unique_candidates:
                            unique_candidates.append(c)

                    if len(unique_candidates) == 1:
                        status = "resolved"
                        antecedent = unique_candidates[0]
                        clause_dict["object"] = antecedent
                    elif len(unique_candidates) > 1:
                        status = "ambiguous"
                        antecedent = None
                    else:
                        status = "unresolved"
                        antecedent = None

                    coref_links.append({"anaphor": marker, "status": status, "antecedent": antecedent})

                if clause_dict.get("subject"):
                    clean_s = self.clean(clause_dict["subject"])
                    if clean_s and clean_s not in {"ele", "ela", "eles", "elas"}:
                        prior_entities.append(clean_s)
                        prior_subjects.append(clean_s)
                raw_obj = clause_dict.get("object") or clause.object
                if raw_obj:
                    clean_o = self.clean(raw_obj)
                    if clean_o and clean_o not in {"ele", "ela", "eles", "elas"}:
                        prior_entities.append(clean_o)

                if clause_dict.get("coordinated"):
                    for coord_dict in clause_dict["coordinated"]:
                        coord_marker = coord_dict.get("clitic_marker")
                        if not coord_marker and coord_dict.get("object") in {"ele", "ela", "eles", "elas"}:
                            coord_marker = coord_dict.get("object")
                        if coord_marker:
                            m_lower = coord_marker.lower()
                            t_gen = "fem" if m_lower in {"a", "la", "as", "las", "ela", "elas"} else "masc"
                            t_num = "plur" if m_lower in {"os", "los", "as", "las", "eles", "elas"} else "sing"
                            coord_subj = self.clean(coord_dict.get("subject") or "")
                            cand = [e for e in prior_entities if self._get_gender_number(e) == (t_gen, t_num) and e != coord_subj]
                            unique_cand: list[str] = []
                            for c in cand:
                                if c not in unique_cand:
                                    unique_cand.append(c)
                            if len(unique_cand) == 1:
                                stat = "resolved"
                                ante = unique_cand[0]
                                coord_dict["object"] = ante
                            elif len(unique_cand) > 1:
                                stat = "ambiguous"
                                ante = None
                            else:
                                stat = "unresolved"
                                ante = None
                            coref_links.append({"anaphor": coord_marker, "status": stat, "antecedent": ante})

                processed_clauses.append(clause_dict)

            # Build nodes and edges from language analysis
            for c_dict in processed_clauses:
                subj = self.clean(c_dict.get("subject") or "")
                rel = c_dict.get("relation")
                obj = self.clean(c_dict.get("object") or "")
                neg = c_dict.get("negated", False)

                if subj and rel and obj:
                    s_node = self._node(nodes, subj, "entity", 1)
                    o_node = self._node(nodes, obj, "entity", 1)
                    if rel in {"attacks", "eats", "sees", "uses", "builds", "creates", "helps", "hurts", "wants", "needs", "knows"}:
                        scene = self._event(nodes, rel, subj, obj)
                        edges.append(MeaningEdge(scene.node_id, "has_agent", s_node.node_id, 9, 0.94, neg, text))
                        edges.append(MeaningEdge(scene.node_id, "has_patient", o_node.node_id, 4, 0.94, neg, text))
                    edges.append(MeaningEdge(s_node.node_id, rel, o_node.node_id, self.RELATION_FAMILY.get(rel, 2), 0.92, neg, text))

                def walk_rel(rel_list: list[dict[str, Any]], depth: int, parent_subj: str, parent_obj: str):
                    for idx, r in enumerate(rel_list):
                        r_rel = r.get("relation")
                        r_ant = r.get("relative_antecedent") or parent_subj
                        r_subj = r_ant
                        r_obj = self.clean(r.get("object") or "")
                        r_neg = r.get("negated", False)
                        prov = f"relative:{depth}:{r.get('relativizer') or 'que'}"
                        if depth > 1:
                            prov = f"{prov}.0.0"

                        if r_subj and r_rel and r_obj:
                            rs = self._node(nodes, r_subj, "entity", 1)
                            ro = self._node(nodes, r_obj, "entity", 1)
                            if r_rel in {"attacks", "eats", "sees", "uses", "builds", "creates", "helps", "hurts", "wants", "needs", "knows"}:
                                scene = self._event(nodes, r_rel, r_subj, r_obj)
                                edges.append(MeaningEdge(scene.node_id, "has_agent", rs.node_id, 9, 0.94, r_neg, text))
                                edges.append(MeaningEdge(scene.node_id, "has_patient", ro.node_id, 4, 0.94, r_neg, text))
                            edges.append(MeaningEdge(rs.node_id, r_rel, ro.node_id, self.RELATION_FAMILY.get(r_rel, 2), 0.92, r_neg, text, provenance=prov))

                        if r.get("relative"):
                            walk_rel(r["relative"], depth + 1, r_obj, "")

                if c_dict.get("relative"):
                    walk_rel(c_dict["relative"], 1, subj, obj)

                if c_dict.get("coordinated"):
                    for coord in c_dict["coordinated"]:
                        co_s = self.clean(coord.get("subject") or subj)
                        co_rel = coord.get("relation")
                        co_obj = self.clean(coord.get("object") or "")
                        if co_s and co_rel and co_obj:
                            cs = self._node(nodes, co_s, "entity", 1)
                            co = self._node(nodes, co_obj, "entity", 1)
                            edges.append(MeaningEdge(cs.node_id, co_rel, co.node_id, self.RELATION_FAMILY.get(co_rel, 2), 0.92, coord.get("negated", False), text))

        else:
            # Fallback regex parsing
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
                edges.append(MeaningEdge(s.node_id, relation, o.node_id, self.RELATION_FAMILY.get(relation, 2), 0.92, negated, sentence))
                self._constraints(nodes, edges, s, sentence)

        # Ensure temporal and modal constraints are populated
        first_node = next(iter(nodes.values()), None)
        if first_node:
            self._constraints(nodes, edges, first_node, normalized)

        vector = self._compose_vector(nodes, edges)
        constraints: dict[str, Any] = {
            "numbers": tuple(float(x.replace(",", ".")) for x in re.findall(r"-?\d+(?:[\.,]\d+)?", normalized)),
            "negated": bool(re.search(r"\b(?:não|nunca|jamais)\b", normalized)),
            "temporal": tuple(v for k, v in self.TEMPORAL.items() if k in normalized),
            "language": {"clauses": processed_clauses} if processed_clauses else {},
            "coreference": coref_links,
        }
        return MeaningRepresentation(
            text,
            frame,
            tuple(nodes.values()),
            tuple(self._dedupe(edges)),
            vector,
            constraints,
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
        clean_surf = self.clean(surface)
        q = self.griot.quids.get(clean_surf) or self.griot.quids.ensure(clean_surf, base=BaseLayer.RICH, family_id=family)
        node_id = f"q:{q.symbol}"
        if node_id not in nodes:
            nodes[node_id] = MeaningNode(node_id, q.symbol, clean_surf, kind, q.family_id, 1.0)
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
        seen: set[tuple[str, str, str, bool, str | None]] = set()
        out: list[MeaningEdge] = []
        for edge in edges:
            key = (edge.source, edge.relation, edge.target, edge.negated, edge.provenance)
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
            self.engine.graph.add_fact(Fact(fact.subject, fact.relation, fact.object, fact.confidence, fact.negated, source, fact.evidence))
            added += 1
        return added

    def meaning_similarity(self, a: str, b: str) -> float:
        va, vb = self.understand(a).vector, self.understand(b).vector
        kernel = self.engine.kernel if hasattr(self.engine, "kernel") else self.engine.numeric
        return kernel.cosine(va, vb) if va and vb else 0.0


__all__ = [
    "MeaningNode",
    "MeaningEdge",
    "MeaningRepresentation",
    "MeaningCompiler",
    "SemanticGRIOT",
]

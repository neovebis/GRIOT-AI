from __future__ import annotations

import ast
import hashlib
import json
import math
import operator
import random
import re
import statistics
import unicodedata
from dataclasses import asdict, dataclass, field
from enum import Enum
from fractions import Fraction
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Sequence


# ============================================================
# GRIOT — numeric/semantic engine
# ============================================================

class BaseLayer(str, Enum):
    PRIMITIVE = "base1"
    FOUNDATION = "base2"
    SCENE = "base3"
    RICH = "base4"


@dataclass(frozen=True, slots=True)
class Family:
    id: int
    name: str
    meaning: str


FAMILIES: dict[int, Family] = {
    1: Family(1, "ONTOLOGY", "existence, identity, type and individuation"),
    2: Family(2, "RELATION", "part, membership, possession, structure and links"),
    3: Family(3, "PROPERTY", "qualities, attributes, measurements and values"),
    4: Family(4, "ACTION", "actions, operations and processes"),
    5: Family(5, "STATE", "states, changes and transitions"),
    6: Family(6, "CAUSALITY", "cause, effect, dependency, enabling and blocking"),
    7: Family(7, "LOGIC", "negation, conjunction, disjunction, quantification and implication"),
    8: Family(8, "SPATIOTEMPORAL", "time, duration, ordering, position and space"),
    9: Family(9, "AGENCY", "agent, intention, goal, plan and utility"),
    10: Family(10, "EPISTEMIC", "evidence, confidence, source, contradiction and knowledge state"),
}


@dataclass(frozen=True, slots=True)
class QUID:
    # A QUID is one Unicode code point; human-readable semantics live outside it.
    code: str
    symbol: str
    label: str
    base: BaseLayer
    family_id: int
    signature: tuple[float, ...]
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if len(self.symbol) != 1:
            raise ValueError("QUID.symbol must be exactly one Unicode code point")
        if not 1 <= self.family_id <= 10:
            raise ValueError("family_id must be in 1..10")


@dataclass(frozen=True, slots=True)
class Fact:
    subject: str
    relation: str
    object: str
    confidence: float = 1.0
    negated: bool = False
    provenance: str = "system"
    evidence: str | None = None
    timestamp: float | None = None


@dataclass(frozen=True, slots=True)
class Inference:
    fact: Fact
    rule: str
    support: tuple[Fact, ...]
    confidence: float


@dataclass(frozen=True, slots=True)
class QueryResult:
    answer: Any
    confidence: float
    evidence: tuple[Fact | Inference, ...] = ()
    explanation: str = ""


@dataclass(frozen=True, slots=True)
class SemanticFrame:
    intent: str
    confidence: float
    tokens: tuple[str, ...]
    entities: tuple[str, ...]
    operations: tuple[str, ...]
    constraints: Mapping[str, Any]
    polarity: str = "positive"


@dataclass(frozen=True, slots=True)
class Proposition:
    subject: str
    relation: str
    object: str
    negated: bool = False
    numeric_value: float | None = None
    source_text: str = ""


@dataclass(frozen=True, slots=True)
class LearningEvent:
    source: str
    facts_added: int
    quids_created: int


@dataclass(frozen=True, slots=True)
class Scene:
    quid: QUID
    components: tuple[str, ...]
    relations: tuple[Fact, ...]


class NumericKernel:
    def __init__(self, dimension: int = 64) -> None:
        if dimension < 8:
            raise ValueError("dimension must be >= 8")
        self.dimension = dimension

    def signature(self, label: str, family_id: int, base: str) -> tuple[float, ...]:
        seed = f"{base}|{family_id}|{label.casefold()}".encode("utf-8")
        values: list[float] = []
        counter = 0
        while len(values) < self.dimension:
            digest = hashlib.blake2b(seed + counter.to_bytes(4, "big"), digest_size=32).digest()
            for i in range(0, len(digest), 4):
                n = int.from_bytes(digest[i : i + 4], "big")
                values.append((n / 2**31) - 1.0)
                if len(values) == self.dimension:
                    break
            counter += 1
        norm = math.sqrt(sum(v * v for v in values)) or 1.0
        return tuple(v / norm for v in values)

    @staticmethod
    def dot(a: Sequence[float], b: Sequence[float]) -> float:
        if len(a) != len(b):
            raise ValueError("vector dimension mismatch")
        return sum(x * y for x, y in zip(a, b))

    @classmethod
    def cosine(cls, a: Sequence[float], b: Sequence[float]) -> float:
        denom = math.sqrt(cls.dot(a, a) * cls.dot(b, b))
        return cls.dot(a, b) / denom if denom else 0.0

    @staticmethod
    def weighted_sum(vectors: Iterable[tuple[Sequence[float], float]]) -> tuple[float, ...]:
        items = list(vectors)
        if not items:
            return ()
        dim = len(items[0][0])
        out = [0.0] * dim
        total = 0.0
        for vec, weight in items:
            if len(vec) != dim:
                raise ValueError("vector dimension mismatch")
            for i, value in enumerate(vec):
                out[i] += value * weight
            total += abs(weight)
        if total == 0:
            return tuple(out)
        norm = math.sqrt(sum(v * v for v in out)) or 1.0
        return tuple(v / norm for v in out)

    @staticmethod
    def determinant(matrix: Sequence[Sequence[float]]) -> float:
        a = [list(map(float, row)) for row in matrix]
        n = len(a)
        if n == 0 or any(len(row) != n for row in a):
            raise ValueError("matrix must be non-empty and square")
        det = 1.0
        for col in range(n):
            pivot = max(range(col, n), key=lambda r: abs(a[r][col]))
            if abs(a[pivot][col]) < 1e-15:
                return 0.0
            if pivot != col:
                a[col], a[pivot] = a[pivot], a[col]
                det *= -1.0
            pivot_value = a[col][col]
            det *= pivot_value
            for row in range(col + 1, n):
                factor = a[row][col] / pivot_value
                for j in range(col + 1, n):
                    a[row][j] -= factor * a[col][j]
        return det

    @staticmethod
    def matmul(a: Sequence[Sequence[float]], b: Sequence[Sequence[float]]) -> list[list[float]]:
        if not a or not b or len(a[0]) != len(b):
            raise ValueError("incompatible matrix dimensions")
        bt = list(zip(*b))
        return [[sum(x * y for x, y in zip(row, col)) for col in bt] for row in a]

    @staticmethod
    def solve_linear(a: Sequence[Sequence[float]], b: Sequence[float]) -> list[float]:
        m = [list(map(float, row)) + [float(rhs)] for row, rhs in zip(a, b)]
        n = len(m)
        if n == 0 or any(len(row) != n + 1 for row in m):
            raise ValueError("A must be square and compatible with b")
        for col in range(n):
            pivot = max(range(col, n), key=lambda r: abs(m[r][col]))
            if abs(m[pivot][col]) < 1e-15:
                raise ValueError("singular matrix")
            m[col], m[pivot] = m[pivot], m[col]
            scale = m[col][col]
            for j in range(col, n + 1):
                m[col][j] /= scale
            for row in range(n):
                if row == col:
                    continue
                factor = m[row][col]
                for j in range(col, n + 1):
                    m[row][j] -= factor * m[col][j]
        return [m[i][-1] for i in range(n)]

    @staticmethod
    def mean(values: Sequence[float]) -> float:
        if not values:
            raise ValueError("values must not be empty")
        return statistics.fmean(values)

    @staticmethod
    def variance(values: Sequence[float]) -> float:
        if len(values) < 2:
            raise ValueError("at least two values required")
        return statistics.variance(values)

    @staticmethod
    def exact_fraction(text: str) -> Fraction:
        return Fraction(text)

    def safe_eval(self, expression: str) -> float | int:
        tree = ast.parse(expression, mode="eval")
        env = {
            "pi": math.pi, "e": math.e, "tau": math.tau,
            "sqrt": math.sqrt, "sin": math.sin, "cos": math.cos, "tan": math.tan,
            "asin": math.asin, "acos": math.acos, "atan": math.atan,
            "log": math.log, "log10": math.log10, "exp": math.exp,
            "factorial": math.factorial, "abs": abs, "round": round,
            "min": min, "max": max, "pow": pow,
        }
        return self._eval_node(tree.body, env)

    def _eval_node(self, node: ast.AST, env: dict[str, object]) -> float | int:
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.Name) and node.id in env:
            value = env[node.id]
            if callable(value):
                raise ValueError(f"function {node.id} requires arguments")
            return value  # type: ignore[return-value]
        if isinstance(node, ast.UnaryOp) and type(node.op) in (ast.UAdd, ast.USub):
            operand = self._eval_node(node.operand, env)
            return +operand if isinstance(node.op, ast.UAdd) else -operand
        if isinstance(node, ast.BinOp):
            left = self._eval_node(node.left, env)
            right = self._eval_node(node.right, env)
            ops: dict[type[ast.operator], Callable[[object, object], object]] = {
                ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
                ast.Div: operator.truediv, ast.FloorDiv: operator.floordiv,
                ast.Mod: operator.mod, ast.Pow: operator.pow,
            }
            fn = ops.get(type(node.op))
            if fn is None:
                raise ValueError("operator not permitted")
            return fn(left, right)  # type: ignore[return-value]
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in env:
            fn = env[node.func.id]
            if not callable(fn):
                raise ValueError("name is not callable")
            if node.keywords:
                raise ValueError("keyword arguments are not permitted")
            args = [self._eval_node(arg, env) for arg in node.args]
            return fn(*args)  # type: ignore[misc]
        raise ValueError(f"expression node not permitted: {type(node).__name__}")


BASE1 = (
    ("∃", "exist", 1, ("existência",)),
    ("=", "identity", 1, ("identidade",)),
    ("≠", "difference", 1, ("diferença",)),
    ("⊂", "part_of", 2, ("parte de",)),
    ("∈", "member_of", 2, ("pertença",)),
    ("∋", "contains", 2, ("conter",)),
    ("⊕", "has", 2, ("ter", "possuir")),
    ("→", "toward", 2, ("direção",)),
    ("≈", "similar", 2, ("semelhante",)),
    ("∼", "associated", 2, ("associado",)),
    ("·", "property", 3, ("propriedade",)),
    ("#", "measure", 3, ("medição",)),
    ("↯", "act", 4, ("ação",)),
    ("Δ", "change", 5, ("mudança",)),
    ("⇒", "causes", 6, ("causa", "causar")),
    ("⟂", "blocks", 6, ("bloqueia",)),
    ("¬", "not", 7, ("não",)),
    ("∧", "and", 7, ("e",)),
    ("∨", "or", 7, ("ou",)),
    ("∀", "all", 7, ("todos",)),
    ("?", "unknown", 10, ("desconhecido",)),
    ("✓", "supported", 10, ("suportado",)),
    ("!", "contradiction", 10, ("contradição",)),
    ("τ", "time", 8, ("tempo",)),
    ("χ", "space", 8, ("espaço",)),
    ("◎", "agent", 9, ("agente",)),
    ("⌁", "goal", 9, ("objetivo",)),
)

BASE2 = (
    ("⚙", "action", 4, ("ação",)),
    ("☍", "result", 5, ("resultado",)),
    ("□", "state", 5, ("estado",)),
    ("◇", "possibility", 7, ("possibilidade",)),
    ("○", "event", 4, ("evento",)),
    ("⊙", "cause", 6, ("causa",)),
    ("⇢", "effect", 6, ("efeito",)),
    ("↺", "reaction", 6, ("reação",)),
    ("♢", "condition", 7, ("condição",)),
    ("⌂", "location", 8, ("local",)),
    ("◷", "duration", 8, ("duração",)),
    ("↑", "increase", 5, ("aumento",)),
    ("↓", "decrease", 5, ("diminuição",)),
    ("↔", "interaction", 2, ("interação",)),
    ("⊙", "subject", 1, ("sujeito",)),
)

BASE3 = (
    ("🎬", "scene", 1, ("cena",)),
    ("⚔", "conflict_scene", 9, ("conflito",)),
    ("🤝", "cooperation_scene", 9, ("cooperação",)),
    ("🏃", "motion_scene", 8, ("movimento",)),
    ("🌱", "growth_scene", 5, ("crescimento",)),
    ("💥", "impact_scene", 6, ("impacto",)),
    ("🔄", "feedback_scene", 6, ("feedback",)),
    ("🧪", "experiment_scene", 10, ("experiência",)),
)

BASE4 = (
    ("🦁", "Panthera leo", 1, ("leão", "lion")),
    ("🐺", "Canis lupus", 1, ("lobo", "wolf")),
    ("🌳", "tree", 1, ("árvore", "tree")),
    ("👤", "human", 1, ("humano", "pessoa", "human")),
    ("🔥", "fire", 1, ("fogo", "fire")),
    ("🌊", "water", 1, ("água", "water")),
    ("🌍", "Earth", 1, ("terra", "earth")),
    ("⚡", "energy", 3, ("energia", "energy")),
)


class QUIDRegistry:
    def __init__(self, kernel: NumericKernel) -> None:
        self.kernel = kernel
        self._by_symbol: dict[str, QUID] = {}
        self._by_code: dict[str, QUID] = {}
        self._by_label: dict[str, QUID] = {}
        self._by_alias: dict[str, QUID] = {}
        self._counter = 10_000
        self._next_private = 0

    def load(self, quids: Iterable[QUID]) -> None:
        for quid in quids:
            self._insert(quid)

    def _insert(self, quid: QUID) -> None:
        if len(quid.symbol) != 1:
            raise ValueError("QUID symbol must be one code point")
        if quid.symbol in self._by_symbol or quid.code in self._by_code:
            raise ValueError("duplicate QUID identity")
        self._by_symbol[quid.symbol] = quid
        self._by_code[quid.code] = quid
        self._by_label.setdefault(quid.label.casefold(), quid)
        for alias in quid.metadata.get("aliases", ()):
            if isinstance(alias, str):
                self._by_alias.setdefault(alias.casefold(), quid)

    @staticmethod
    def code(n: int) -> str:
        return f"{n:010d}"

    def _new_symbol(self) -> str:
        while True:
            symbol = chr(0xE000 + self._next_private)
            self._next_private += 1
            if symbol not in self._by_symbol:
                return symbol

    def ensure(
        self,
        label: str,
        *,
        base: BaseLayer = BaseLayer.RICH,
        family_id: int = 1,
        symbol: str | None = None,
        aliases: Iterable[str] = (),
    ) -> QUID:
        key = label.casefold().strip()
        existing = self._by_label.get(key) or self._by_alias.get(key)
        if existing:
            return existing
        symbol = symbol or self._new_symbol()
        if len(symbol) != 1:
            raise ValueError("every QUID must be exactly one Unicode code point")
        self._counter += 1
        q = QUID(
            code=self.code(self._counter),
            symbol=symbol,
            label=label,
            base=base,
            family_id=family_id,
            signature=self.kernel.signature(label, family_id, base.value),
            metadata={"aliases": tuple(aliases), "learned": True},
        )
        self._insert(q)
        return q

    def get(self, value: str) -> QUID | None:
        key = value.casefold()
        return self._by_symbol.get(value) or self._by_code.get(value) or self._by_label.get(key) or self._by_alias.get(key)

    def all(self) -> tuple[QUID, ...]:
        return tuple(self._by_symbol.values())


class KnowledgeGraph:
    INVERSES = {
        "part_of": "contains", "contains": "part_of",
        "member_of": "contains", "has": "possessed_by",
        "possessed_by": "has", "causes": "caused_by",
        "caused_by": "causes", "before": "after", "after": "before",
    }
    TRANSITIVE = {"is_a", "part_of", "member_of", "before", "after", "causes"}

    def __init__(self) -> None:
        self._facts: set[Fact] = set()
        self._by_relation: dict[str, set[Fact]] = {}
        self._rules: list[tuple[str, str, str, str]] = []
        self._contradictions: set[tuple[str, str, str]] = set()

    def add_rule(self, name: str, antecedent_relation: str, consequent_relation: str, bridge_relation: str) -> None:
        self._rules.append((name, antecedent_relation, consequent_relation, bridge_relation))

    def add_fact(self, fact: Fact) -> Fact:
        f = Fact(
            subject=fact.subject, relation=fact.relation, object=fact.object,
            confidence=max(0.0, min(1.0, fact.confidence)),
            negated=fact.negated, provenance=fact.provenance,
            evidence=fact.evidence, timestamp=fact.timestamp,
        )
        key = (f.subject, f.relation, f.object)
        if any((x.subject, x.relation, x.object) == key and x.negated != f.negated for x in self._facts):
            self._contradictions.add(key)
        self._facts.add(f)
        self._by_relation.setdefault(f.relation, set()).add(f)
        return f

    def facts(self) -> tuple[Fact, ...]:
        return tuple(self._facts)

    def query(self, subject: str, relation: str, object_: str | None = None) -> list[Fact | Inference]:
        direct = [f for f in self._facts if f.subject == subject and f.relation == relation and (object_ is None or f.object == object_)]
        out: list[Fact | Inference] = list(direct)
        if relation in self.TRANSITIVE:
            out.extend(self._transitive(subject, relation, object_))
        out.extend(self._rules_for(subject, relation, object_))
        return self._dedupe(out)

    def _transitive(self, subject: str, relation: str, target: str | None) -> Iterable[Inference]:
        adjacency: dict[str, set[str]] = {}
        edge: dict[tuple[str, str], Fact] = {}
        for f in self._by_relation.get(relation, ()):
            if f.negated:
                continue
            adjacency.setdefault(f.subject, set()).add(f.object)
            edge[(f.subject, f.object)] = f

        queue: list[str] = [subject]
        paths: dict[str, tuple[Fact, ...]] = {subject: ()}
        visited = {subject}
        while queue:
            current = queue.pop(0)
            for nxt in adjacency.get(current, ()):
                if nxt in visited:
                    continue
                visited.add(nxt)
                queue.append(nxt)
                path = paths[current] + (edge[(current, nxt)],)
                paths[nxt] = path
                if target is None or nxt == target:
                    conf = math.prod(f.confidence for f in path) * (0.92 ** max(0, len(path) - 1))
                    yield Inference(
                        fact=Fact(subject, relation, nxt, confidence=conf, provenance="inference"),
                        rule=f"transitive:{relation}", support=path, confidence=conf,
                    )

    def _rules_for(self, subject: str, relation: str, target: str | None) -> Iterable[Inference]:
        for name, antecedent, consequent, bridge_relation in self._rules:
            if relation != consequent:
                continue
            antecedent_facts = [f for f in self._by_relation.get(antecedent, ()) if f.subject == subject and not f.negated]
            bridge_facts = list(self._by_relation.get(bridge_relation, ()))
            for first in antecedent_facts:
                for bridge in bridge_facts:
                    if bridge.subject != first.object or bridge.negated:
                        continue
                    if target is not None and bridge.object != target:
                        continue
                    conf = min(first.confidence, bridge.confidence) * 0.9
                    yield Inference(
                        fact=Fact(subject, relation, bridge.object, confidence=conf, provenance="rule"),
                        rule=name, support=(first, bridge), confidence=conf,
                    )

    @staticmethod
    def _dedupe(items: Iterable[Fact | Inference]) -> list[Fact | Inference]:
        out: list[Fact | Inference] = []
        seen: set[tuple[str, str, str, bool]] = set()
        for item in items:
            f = item if isinstance(item, Fact) else item.fact
            key = (f.subject, f.relation, f.object, f.negated)
            if key not in seen:
                seen.add(key)
                out.append(item)
        return out

    def contradictory(self, subject: str, relation: str, object_: str) -> bool:
        return (subject, relation, object_) in self._contradictions


class SemanticInterpreter:
    INTENTS = {
        "calculate": ("calcula", "calcular", "quanto", "equação", "conta", "matriz", "estatística"),
        "learn": ("aprende", "aprender", "memoriza", "guarda", "leia", "lê", "ensina"),
        "simulate": ("simula", "simular", "simulação", "acontece", "e se", "cenário"),
        "explain": ("explica", "explicar", "por que", "porque", "como", "o que", "significa"),
        "compare": ("compara", "comparar", "diferença", "parecido", "semelhante"),
        "create": ("cria", "criar", "desenha", "gera", "constrói", "coda"),
        "query": ("é", "tem", "faz parte", "onde", "quem", "qual"),
    }
    PATTERNS = (
        (re.compile(r"^(.*?)\s+faz parte (?:de|do|da|dos|das)\s+(.*?)$", re.I), "part_of"),
        (re.compile(r"^(.*?)\s+pertence a\s+(.*?)$", re.I), "member_of"),
        (re.compile(r"^(.*?)\s+é um\s+(.*?)$", re.I), "is_a"),
        (re.compile(r"^(.*?)\s+é uma\s+(.*?)$", re.I), "is_a"),
        (re.compile(r"^(.*?)\s+é\s+(.*?)$", re.I), "is_a"),
        (re.compile(r"^(.*?)\s+tem\s+(.*?)$", re.I), "has"),
        (re.compile(r"^(.*?)\s+possui\s+(.*?)$", re.I), "has"),
        (re.compile(r"^(.*?)\s+causa\s+(.*?)$", re.I), "causes"),
        (re.compile(r"^(.*?)\s+provoca\s+(.*?)$", re.I), "causes"),
        (re.compile(r"^(.*?)\s+resulta em\s+(.*?)$", re.I), "causes"),
        (re.compile(r"^(.*?)\s+antes de\s+(.*?)$", re.I), "before"),
        (re.compile(r"^(.*?)\s+depois de\s+(.*?)$", re.I), "after"),
    )

    def __init__(self, registry: QUIDRegistry, kernel: NumericKernel) -> None:
        self.registry = registry
        self.kernel = kernel

    @staticmethod
    def normalize(text: str) -> str:
        text = unicodedata.normalize("NFKC", text).casefold().strip()
        text = re.sub(r"[!?;:]+", " ", text)
        return re.sub(r"\s+", " ", text)

    def intent(self, text: str) -> SemanticFrame:
        normalized = self.normalize(text)
        tokens = tuple(re.findall(r"\w+|[^\w\s]", normalized, flags=re.UNICODE))
        scores = {k: 0.0 for k in self.INTENTS}
        for name, phrases in self.INTENTS.items():
            for phrase in phrases:
                if phrase in normalized:
                    scores[name] += 1.0 + 0.1 * len(phrase.split())
        if any(ch.isdigit() for ch in normalized) and any(op in normalized for op in ("+", "-", "*", "/", "^")):
            scores["calculate"] += 2.0
        best = max(scores, key=scores.get)
        weights = {k: math.exp(v) for k, v in scores.items()}
        confidence = weights[best] / (sum(weights.values()) or 1.0)
        stop = {"o","a","os","as","um","uma","de","do","da","dos","das","que","é","e","em","para","por","com","tem","calcula","explica"}
        entities = tuple(sorted({t for t in tokens if len(t) > 2 and t.isalpha() and t not in stop}))
        operations: list[str] = []
        if any(x in normalized for x in ("calcula", "quanto", "equação", "matriz")): operations.append("numeric_compute")
        if any(x in normalized for x in ("simula", "cenário", "e se")): operations.append("state_transition")
        if any(x in normalized for x in ("aprende", "ensina", "lê", "leia")): operations.append("induce_knowledge")
        if any(x in normalized for x in ("explica", "por que", "significa")): operations.append("semantic_query")
        polarity = "negative" if re.search(r"\bn[aã]o\b|\bnunca\b", normalized) else "positive"
        return SemanticFrame(best, confidence, tokens, entities, tuple(operations), {"numeric_literals": tuple(re.findall(r"-?\d+(?:[\.,]\d+)?", normalized))}, polarity)

    def propositions(self, text: str) -> list[Proposition]:
        result: list[Proposition] = []
        for raw in re.split(r"[.!?]+", self.normalize(text)):
            sentence = raw.strip()
            if not sentence:
                continue
            negated = bool(re.search(r"\bn[aã]o\b|\bnunca\b", sentence))
            cleaned = re.sub(r"\bn[aã]o\b\s*", "", sentence, count=1).strip()
            for pattern, relation in self.PATTERNS:
                m = pattern.match(cleaned)
                if not m:
                    continue
                subject = self._clean(m.group(1))
                object_ = self._clean(m.group(2))
                if subject and object_:
                    number = re.search(r"-?\d+(?:[\.,]\d+)?", object_)
                    value = float(number.group(0).replace(",", ".")) if number else None
                    result.append(Proposition(subject, relation, object_, negated, value, sentence))
                break
        return result

    @staticmethod
    def _clean(value: str) -> str:
        value = re.sub(r"^(um|uma|o|a|os|as)\s+", "", value.strip())
        return value.strip(" ,.")

    def materialize(self, p: Proposition) -> Fact:
        s = self._resolve(p.subject)
        o = self._resolve(p.object)
        return Fact(s.symbol, p.relation, o.symbol, 0.92, p.negated, "semantic-interpreter", p.source_text)

    def _resolve(self, label: str) -> QUID:
        return self.registry.get(label) or self.registry.ensure(label, base=BaseLayer.RICH, family_id=1)


class TextLearner:
    def __init__(self, registry: QUIDRegistry, graph: KnowledgeGraph, interpreter: SemanticInterpreter) -> None:
        self.registry = registry
        self.graph = graph
        self.interpreter = interpreter

    def ingest(self, text: str, source: str = "text") -> LearningEvent:
        before = len(self.registry.all())
        propositions = self.interpreter.propositions(text)
        for p in propositions:
            f = self.interpreter.materialize(p)
            self.graph.add_fact(Fact(f.subject, f.relation, f.object, f.confidence, f.negated, source, f.evidence))
        return LearningEvent(source, len(propositions), len(self.registry.all()) - before)

    def ingest_file(self, path: str | Path, source: str | None = None) -> LearningEvent:
        p = Path(path)
        return self.ingest(p.read_text(encoding="utf-8"), source or str(p))


class SceneBuilder:
    def __init__(self, registry: QUIDRegistry, graph: KnowledgeGraph) -> None:
        self.registry, self.graph = registry, graph

    def compose(self, label: str, components: Iterable[str], relations: Iterable[Fact] = ()) -> Scene:
        q = self.registry.ensure(label, base=BaseLayer.SCENE, family_id=1)
        component_symbols = tuple(components)
        for component in component_symbols:
            self.graph.add_fact(Fact(q.symbol, "composed_of", component, 1.0, False, "scene-builder"))
        rels = tuple(relations)
        for fact in rels:
            self.graph.add_fact(fact)
        return Scene(q, component_symbols, rels)


@dataclass(slots=True)
class TransitionRule:
    name: str
    condition: Callable[[Mapping[str, float]], bool]
    apply: Callable[[dict[str, float]], None]


class Simulator:
    def run(self, initial: Mapping[str, float], rules: tuple[TransitionRule, ...], steps: int) -> dict[str, Any]:
        if steps < 0:
            raise ValueError("steps must be >= 0")
        state = dict(initial)
        states = [dict(state)]
        counts = {r.name: 0 for r in rules}
        for _ in range(steps):
            progressed = False
            for rule in rules:
                if rule.condition(state):
                    rule.apply(state)
                    counts[rule.name] += 1
                    progressed = True
            states.append(dict(state))
            if not progressed:
                break
        return {"states": states, "terminal": dict(state), "metrics": {**{f"rule:{k}": float(v) for k, v in counts.items()}, "steps_executed": float(len(states)-1)}}

    def monte_carlo(self, initial: Mapping[str, float], transition: Callable[[dict[str, float], random.Random], None], *, steps: int, runs: int, seed: int = 0, metric: Callable[[Mapping[str, float]], float] | None = None) -> dict[str, float]:
        if steps < 0 or runs <= 0:
            raise ValueError("steps must be >= 0 and runs > 0")
        rng = random.Random(seed)
        values = []
        for _ in range(runs):
            state = dict(initial)
            for _ in range(steps):
                transition(state, rng)
            values.append(metric(state) if metric else sum(state.values()))
        mean = sum(values) / len(values)
        return {"mean": mean, "variance": sum((x-mean)**2 for x in values)/len(values), "min": min(values), "max": max(values)}


@dataclass(slots=True)
class GRIOT:
    kernel: NumericKernel
    quids: QUIDRegistry
    graph: KnowledgeGraph
    interpreter: SemanticInterpreter
    learner: TextLearner
    scenes: SceneBuilder
    simulator: Simulator
    version: str = "0.1.0"

    @classmethod
    def create(cls, dimension: int = 64) -> "GRIOT":
        kernel = NumericKernel(dimension)
        registry = QUIDRegistry(kernel)
        registry.load(_builtins(kernel))
        graph = KnowledgeGraph()
        graph.add_rule("type_transitivity", "is_a", "is_a", "is_a")
        graph.add_rule("part_transitivity", "part_of", "part_of", "part_of")
        graph.add_rule("causal_chain", "causes", "causes", "causes")
        interpreter = SemanticInterpreter(registry, kernel)
        return cls(kernel, registry, graph, interpreter, TextLearner(registry, graph, interpreter), SceneBuilder(registry, graph), Simulator())

    def understand(self, text: str) -> SemanticFrame:
        return self.interpreter.intent(text)

    def analisar(self, text: str):
        """Run the unified A1 semantic + proof pipeline."""
        from quid_core import Quid

        return Quid(self).analisar(text)

    def learn(self, text: str, source: str = "text") -> LearningEvent:
        return self.learner.ingest(text, source)

    def ask(self, text: str) -> QueryResult:
        """Compatibility API backed entirely by the unified A1 pipeline."""
        analysis = self.analisar(text)
        evidence = tuple(
            self.graph.query(
                next(
                    (n.quid for n in analysis.gir.nodes if n.node_id == edge.source),
                    "",
                ),
                edge.relation,
                next(
                    (n.quid for n in analysis.gir.nodes if n.node_id == edge.target),
                    "",
                ),
            )
            for edge in analysis.gir.edges
            if edge.relation in analysis.reasoning.__class__.__annotations__.get("status", ())
        )
        # The proof-oriented result is authoritative; avoid a second semantic
        # parser or a second truth decision in this compatibility adapter.
        return QueryResult(
            analysis.answer,
            analysis.confidence,
            analysis.reasoning.proofs,
            analysis.explanation,
        )

    def calculate(self, expression: str) -> float | int:
        return self.kernel.safe_eval(expression)

    def compose_scene(self, label: str, components: tuple[str, ...], relations: tuple[Fact, ...] = ()) -> Scene:
        return self.scenes.compose(label, components, relations)

    def save(self, path: str | Path) -> None:
        payload = {
            "format": "griot-snapshot", "version": self.version,
            "quids": [asdict(q) | {"base": q.base.value} for q in self.quids.all()],
            "facts": [asdict(f) for f in self.graph.facts()],
        }
        Path(path).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: str | Path) -> "GRIOT":
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        if payload.get("format") != "griot-snapshot":
            raise ValueError("invalid GRIOT snapshot format")
        engine = cls.create()
        builtin_symbols = {q.symbol for q in engine.quids.all()}
        for raw in payload.get("quids", []):
            if raw["symbol"] in builtin_symbols:
                continue
            q = QUID(
                code=str(raw["code"]), symbol=str(raw["symbol"]), label=str(raw["label"]),
                base=BaseLayer(str(raw["base"])), family_id=int(raw["family_id"]),
                signature=tuple(float(x) for x in raw["signature"]),
                metadata=dict(raw.get("metadata") or {}),
            )
            engine.quids.load((q,))
        for raw in payload.get("facts", []):
            engine.graph.add_fact(Fact(
                str(raw["subject"]), str(raw["relation"]), str(raw["object"]),
                float(raw.get("confidence", 1.0)), bool(raw.get("negated", False)),
                str(raw.get("provenance", "snapshot")), raw.get("evidence"), raw.get("timestamp"),
            ))
        return engine

    def state(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "quids": len(self.quids.all()),
            "facts": len(self.graph.facts()),
            "vector_dimension": self.kernel.dimension,
            "families": {i: sum(q.family_id == i for q in self.quids.all()) for i in FAMILIES},
            "bases": {b.value: sum(q.base == b for q in self.quids.all()) for b in BaseLayer},
        }


def _builtins(kernel: NumericKernel) -> tuple[QUID, ...]:
    output: list[QUID] = []
    serial = 1
    seen: set[str] = set()
    for base, definitions in (
        (BaseLayer.PRIMITIVE, BASE1),
        (BaseLayer.FOUNDATION, BASE2),
        (BaseLayer.SCENE, BASE3),
        (BaseLayer.RICH, BASE4),
    ):
        for symbol, label, family, aliases in definitions:
            if symbol in seen:
                continue
            seen.add(symbol)
            output.append(QUID(
                code=f"{serial:010d}", symbol=symbol, label=label,
                base=base, family_id=family,
                signature=kernel.signature(label, family, base.value),
                metadata={"aliases": aliases, "builtin": True},
            ))
            serial += 1
    return tuple(output)


class GriotHTTP(BaseHTTPRequestHandler):
    engine = GRIOT.create()

    def _send(self, status: int, payload: Any) -> None:
        body = json.dumps(payload, ensure_ascii=False, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/state":
            self._send(200, self.engine.state())
        else:
            self._send(404, {"error": "not_found"})

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 1_000_000:
                raise ValueError("request too large")
            payload = json.loads(self.rfile.read(length) or b"{}")
            if self.path == "/understand":
                self._send(200, asdict(self.engine.understand(str(payload["text"]))))
            elif self.path == "/learn":
                self._send(200, asdict(self.engine.learn(str(payload["text"]), str(payload.get("source", "api")))))
            elif self.path == "/ask":
                self._send(200, asdict(self.engine.ask(str(payload["text"]))))
            elif self.path == "/calculate":
                self._send(200, {"result": self.engine.calculate(str(payload["expression"]))})
            else:
                self._send(404, {"error": "not_found"})
        except (KeyError, ValueError, json.JSONDecodeError) as exc:
            self._send(400, {"error": str(exc)})
        except Exception as exc:
            self._send(500, {"error": "internal_error", "detail": str(exc)})

    def log_message(self, *_: object) -> None:
        return


def serve(host: str = "127.0.0.1", port: int = 8787) -> None:
    ThreadingHTTPServer((host, port), GriotHTTP).serve_forever()


def demo() -> None:
    g = GRIOT.create()
    g.learn("O leão é um animal. O leão faz parte dos mamíferos. O leão tem juba. O animal é um ser vivo.", "demo")
    print("STATE", g.state())
    print("QUID", g.quids.get("leão"))
    for q in ("leão é um animal", "leão faz parte de mamíferos", "leão tem juba", "leão é um ser vivo"):
        print(q, "=>", g.ask(q))
    print("INTENT", g.understand("por que o leão causa medo?"))
    print("CALC", g.calculate("(2 + 3) ** 5 + sqrt(81)"))
    print("SOLVE", g.kernel.solve_linear([[2, 1], [1, 3]], [7, 11]))


if __name__ == "__main__":
    demo()

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

from griot_semantic_ir import SemanticGRIOT
try:
    from griot_engine import Fact
except ImportError:
    from griot.types import Fact


@dataclass(frozen=True, slots=True)
class InductionReport:
    source: str
    representations: int
    candidates: int
    committed: int
    contradictions: int


class KnowledgeInducer:
    """
    Phase-2 deterministic knowledge acquisition.

    Text is compiled into semantic structures, then enriched with definitions,
    property relations, numeric ranges, explanations and explicit conditionals.
    No neural training is performed.
    """

    DEFINITION = re.compile(
        r"^(?:o|a|um|uma)?\s*(.*?)\s+é\s+(?:um|uma)\s+(.*?)(?:\s+que\s+(.+))?$",
        re.I,
    )
    RANGE = re.compile(
        r"^(.*?)\s+(?:pesa|mede|mede-se|tem)\s+entre\s+"
        r"(-?\d+(?:[\.,]\d+)?)\s+e\s+"
        r"(-?\d+(?:[\.,]\d+)?)\s*([a-zA-ZÀ-ÿ%]+)?$",
        re.I,
    )
    CONDITIONAL = re.compile(r"^se\s+(.+?),?\s+então\s+(.+)$", re.I)
    WHY = re.compile(r"^(.+?)\s+porque\s+(.+)$", re.I)
    PROPERTY = re.compile(
        r"^(.*?)\s+(?:tem|possui|contém|cobre)\s+(?:um|uma|o|a|os|as)?\s*(.+)$",
        re.I,
    )

    def __init__(self, semantic: SemanticGRIOT | None = None) -> None:
        self.semantic = semantic or SemanticGRIOT()

    def induce(self, text: str, source: str = "text") -> InductionReport:
        meaning = self.semantic.understand(text)
        candidates = list(meaning.facts())
        candidates.extend(self._nested_definitions(text))
        candidates.extend(self._ranges(text))
        candidates.extend(self._conditionals(text))
        candidates.extend(self._causal_explanations(text))
        candidates.extend(self._properties(text))

        deduped: dict[tuple[str, str, str, bool], Fact] = {}
        for fact in candidates:
            deduped[(fact.subject, fact.relation, fact.object, fact.negated)] = Fact(
                fact.subject,
                fact.relation,
                fact.object,
                min(1.0, max(0.0, fact.confidence)),
                fact.negated,
                source,
                fact.evidence,
            )

        before = len(self._contradictions())
        for fact in deduped.values():
            self.semantic.engine.graph.add_fact(fact)
        after = len(self._contradictions())

        return InductionReport(
            source=source,
            representations=1,
            candidates=len(deduped),
            committed=len(deduped),
            contradictions=max(0, after - before),
        )

    def learn_many(self, documents: Iterable[tuple[str, str]]) -> list[InductionReport]:
        return [self.induce(text, source) for text, source in documents]

    def _nested_definitions(self, text: str) -> list[Fact]:
        facts: list[Fact] = []
        for raw in re.split(r"[.!?]+", self.semantic.compiler.normalize(text)):
            sentence = raw.strip()
            match = self.DEFINITION.match(sentence)
            if not match:
                continue
            subject = self.semantic.compiler.clean(match.group(1))
            kind = self.semantic.compiler.clean(match.group(2))
            tail = match.group(3)
            if not tail and " que " in kind:
                kind, tail = kind.split(" que ", 1)
                kind = self.semantic.compiler.clean(kind)
                tail = self.semantic.compiler.clean(tail)
            if subject and kind:
                s = self._quid(subject)
                k = self._quid(kind)
                facts.append(Fact(s.symbol, "is_a", k.symbol, 0.94, False, "induction", sentence))
            if tail and subject:
                for property_fact in self._simple_property(tail, subject):
                    facts.append(property_fact)
        return facts

    def _ranges(self, text: str) -> list[Fact]:
        facts: list[Fact] = []
        for sentence in re.split(r"[.!?]+", self.semantic.compiler.normalize(text)):
            match = self.RANGE.match(sentence.strip())
            if not match:
                continue
            subject = self.semantic.compiler.clean(match.group(1))
            low = match.group(2).replace(",", ".")
            high = match.group(3).replace(",", ".")
            unit = match.group(4) or "unitless"
            sq = self._quid(subject)
            low_q = self._quid(f"number:{low}", family=3)
            high_q = self._quid(f"number:{high}", family=3)
            unit_q = self._quid(f"unit:{unit}", family=3)
            facts.extend(
                [
                    Fact(sq.symbol, "has_min_value", low_q.symbol, 0.96, False, "induction", sentence),
                    Fact(sq.symbol, "has_max_value", high_q.symbol, 0.96, False, "induction", sentence),
                    Fact(sq.symbol, "has_unit", unit_q.symbol, 0.96, False, "induction", sentence),
                ]
            )
        return facts

    def _conditionals(self, text: str) -> list[Fact]:
        facts: list[Fact] = []
        for sentence in re.split(r"[.!?]+", self.semantic.compiler.normalize(text)):
            match = self.CONDITIONAL.match(sentence.strip())
            if not match:
                continue
            condition_q = self._quid(f"condition:{match.group(1).strip()}", family=7)
            consequence_q = self._quid(f"consequence:{match.group(2).strip()}", family=7)
            facts.extend(
                [
                    Fact(condition_q.symbol, "condition_text", condition_q.symbol, 0.82, False, "induction", match.group(1).strip()),
                    Fact(condition_q.symbol, "implies", consequence_q.symbol, 0.86, False, "induction", sentence),
                    Fact(consequence_q.symbol, "consequence_text", consequence_q.symbol, 0.82, False, "induction", match.group(2).strip()),
                ]
            )

            antecedent = self.semantic.understand(match.group(1))
            consequent = self.semantic.understand(match.group(2))
            first = next((f for f in antecedent.facts() if f.relation not in {"has_agent", "has_patient"}), None)
            second = next((f for f in consequent.facts() if f.relation not in {"has_agent", "has_patient"}), None)
            if first:
                facts.append(Fact(condition_q.symbol, "condition_has", first.subject, 0.88, False, "induction", sentence))
            if second:
                facts.append(Fact(consequence_q.symbol, "causes", second.object, 0.84, False, "induction", sentence))
        return facts

    def _causal_explanations(self, text: str) -> list[Fact]:
        facts: list[Fact] = []
        for sentence in re.split(r"[.!?]+", self.semantic.compiler.normalize(text)):
            match = self.WHY.match(sentence.strip())
            if not match:
                continue
            left = self.semantic.understand(match.group(1))
            right = self.semantic.understand(match.group(2))
            effect = next((f for f in left.facts() if f.relation not in {"has_agent", "has_patient"}), None)
            cause = next((f for f in right.facts() if f.relation not in {"has_agent", "has_patient"}), None)
            if effect and cause:
                facts.append(Fact(cause.subject, "causes", effect.subject, 0.84, False, "induction", sentence))
        return facts

    def _properties(self, text: str) -> list[Fact]:
        facts: list[Fact] = []
        for sentence in re.split(r"[.!?]+", self.semantic.compiler.normalize(text)):
            match = self.PROPERTY.match(sentence.strip())
            if not match:
                continue
            subject = self.semantic.compiler.clean(match.group(1))
            obj = self.semantic.compiler.clean(match.group(2))
            if subject and obj:
                facts.extend(self._simple_property(obj, subject))
        return facts

    def _simple_property(self, expression: str, subject: str) -> list[Fact]:
        expression = self.semantic.compiler.clean(expression)
        match = re.match(
            r"^(?:tem|possui|contém|cobre)\s+(?:um|uma|o|a|os|as)?\s*(.+)$",
            expression,
            re.I,
        )
        if match:
            expression = self.semantic.compiler.clean(match.group(1))
        sq = self._quid(subject)
        oq = self._quid(expression, family=2)
        return [Fact(sq.symbol, "has", oq.symbol, 0.9, False, "induction", expression)]

    def _quid(self, label: str, family: int = 1):
        return (
            self.semantic.engine.quids.get(label)
            or self.semantic.engine.quids.ensure(label, family_id=family)
        )

    def _contradictions(self) -> tuple[tuple[str, str, str], ...]:
        values = getattr(self.semantic.engine.graph, "_contradictions", None)
        return tuple(values or ())


__all__ = ["InductionReport", "KnowledgeInducer"]

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import re


class IntentType(str, Enum):
    QUERY = "query"
    ASSERTION = "assertion"
    REQUEST = "request"
    COMMAND = "command"
    EXPLANATION = "explanation"
    CALCULATION = "calculation"
    LEARNING = "learning"
    SIMULATION = "simulation"
    COMPARISON = "comparison"
    CREATION = "creation"
    DEFINITION = "definition"
    UNKNOWN = "unknown"


@dataclass(frozen=True, slots=True)
class IntentSignal:
    pattern: str
    intent: IntentType
    weight: float


@dataclass(frozen=True, slots=True)
class SemanticIntent:
    primary: IntentType
    confidence: float
    secondary: tuple[IntentType, ...]
    signals: tuple[IntentSignal, ...]
    speech_act: str
    target: str

    @property
    def is_query(self) -> bool:
        return self.primary in {
            IntentType.QUERY,
            IntentType.EXPLANATION,
            IntentType.CALCULATION,
            IntentType.DEFINITION,
            IntentType.COMPARISON,
        }


class SemanticIntentDetector:
    """Deterministic semantic-intent classifier with explicit evidence."""

    DIRECT_RULES = (
        (r"^o que\s+é\b", IntentType.DEFINITION, 5.0),
        (r"^o que\s+são\b", IntentType.DEFINITION, 5.0),
        (r"\bcalcula(?:r)?\b", IntentType.CALCULATION, 4.0),
        (r"\bquanto\s+(?:é|e)\b", IntentType.CALCULATION, 3.8),
        (r"\bcalcule\b", IntentType.CALCULATION, 4.0),
        (r"\bexplica(?:r)?\b", IntentType.EXPLANATION, 4.0),
        (r"\bpor\s+que\b", IntentType.EXPLANATION, 3.4),
        (r"\bporque\b", IntentType.EXPLANATION, 2.0),
        (r"\baprende(?:r)?\b|\bmemoriza(?:r)?\b|\bguarda\b", IntentType.LEARNING, 4.0),
        (r"\bsimula(?:r)?\b|\bsimulação\b|\be\s+se\b", IntentType.SIMULATION, 4.0),
        (r"\bcompara(?:r)?\b|\bdiferença\b", IntentType.COMPARISON, 3.8),
        (r"\bcria(?:r)?\b|\bgera(?:r)?\b|\bdesenha(?:r)?\b", IntentType.CREATION, 3.8),
        (r"\bdefine(?:r)?\b|\bsignifica\b", IntentType.DEFINITION, 3.8),
        (r"\bmostra(?:r)?\b|\bmostre\b|\bdiz(?:e)?\b|\bencontra(?:r)?\b", IntentType.REQUEST, 3.0),
    )

    QUESTION_PREFIXES = (
        "o que", "o que é", "o que sao", "o que são", "quem", "qual", "quais",
        "onde", "quando", "como", "por que", "porque",
    )

    def detect(self, text: str, frame: object | None = None) -> SemanticIntent:
        if not isinstance(text, str):
            raise TypeError("text must be a string")
        normalized = re.sub(r"\s+", " ", text.casefold().strip())
        if not normalized:
            raise ValueError("text must not be empty")

        signals: list[IntentSignal] = []
        scores: dict[IntentType, float] = {}

        for pattern, intent, weight in self.DIRECT_RULES:
            if re.search(pattern, normalized, re.I):
                signals.append(IntentSignal(pattern, intent, weight))
                scores[intent] = scores.get(intent, 0.0) + weight

        if normalized.endswith("?") or normalized.startswith(self.QUESTION_PREFIXES):
            question_weight = 1.5 if scores else 3.5
            signal = IntentSignal("question-form", IntentType.QUERY, question_weight)
            signals.append(signal)
            scores[IntentType.QUERY] = scores.get(IntentType.QUERY, 0.0) + question_weight

        frame_intent = getattr(frame, "intent", None)
        frame_map = {
            "calculate": IntentType.CALCULATION,
            "learn": IntentType.LEARNING,
            "simulate": IntentType.SIMULATION,
            "explain": IntentType.EXPLANATION,
            "compare": IntentType.COMPARISON,
            "create": IntentType.CREATION,
            "query": IntentType.QUERY,
        }
        if frame_intent in frame_map:
            mapped = frame_map[frame_intent]
            frame_weight = 0.20
            signal = IntentSignal(f"frame:{frame_intent}", mapped, frame_weight)
            signals.append(signal)
            scores[mapped] = scores.get(mapped, 0.0) + frame_weight

        if not scores:
            primary = IntentType.ASSERTION
            confidence = 0.55
            secondary: tuple[IntentType, ...] = ()
            speech_act = "assertion"
        else:
            ranked = sorted(scores.items(), key=lambda item: (-item[1], item[0].value))
            primary = ranked[0][0]
            total = sum(score for _, score in ranked)
            confidence = min(0.99, ranked[0][1] / total if total else 0.0)
            secondary = tuple(intent for intent, _ in ranked[1:4])
            speech_act = self._speech_act(primary)

        target = self._extract_target(normalized)
        return SemanticIntent(
            primary,
            confidence,
            secondary,
            tuple(sorted(signals, key=lambda s: (s.intent.value, s.pattern, -s.weight))),
            speech_act,
            target,
        )

    @staticmethod
    def _speech_act(primary: IntentType) -> str:
        if primary in {IntentType.REQUEST, IntentType.COMMAND}:
            return "directive"
        if primary in {
            IntentType.QUERY,
            IntentType.EXPLANATION,
            IntentType.CALCULATION,
            IntentType.DEFINITION,
            IntentType.COMPARISON,
        }:
            return "interrogative"
        if primary is IntentType.LEARNING:
            return "instruction_to_learn"
        if primary is IntentType.SIMULATION:
            return "hypothetical"
        if primary is IntentType.CREATION:
            return "creative_request"
        return "declarative"

    @staticmethod
    def _extract_target(text: str) -> str:
        cleaned = re.sub(
            r"^(?:o que|quem|qual|quais|onde|quando|como|por que|porque)\s+",
            "",
            text,
            count=1,
        )
        cleaned = re.sub(
            r"^(?:calcula(?:r)?|calcule|explica(?:r)?|aprende(?:r)?|memoriza(?:r)?|simula(?:r)?|compara(?:r)?|cria(?:r)?|define(?:r)?|mostra(?:r)?|mostre)\s+",
            "",
            cleaned,
            count=1,
        )
        return cleaned.strip(" ?.!")[:240]


__all__ = [
    "IntentSignal",
    "IntentType",
    "SemanticIntent",
    "SemanticIntentDetector",
]

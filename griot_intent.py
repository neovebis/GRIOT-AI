from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import re
from typing import TYPE_CHECKING


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
        (r"calcula(?:r)?", IntentType.CALCULATION, 4.0),
        (r"quantos+(?:é|e)", IntentType.CALCULATION, 3.8),
        (r"calcule", IntentType.CALCULATION, 4.0),
        (r"explica(?:r)?", IntentType.EXPLANATION, 4.0),
        (r"pors+que", IntentType.EXPLANATION, 3.4),
        (r"porque", IntentType.EXPLANATION, 2.0),
        (r"aprende(?:r)?|memoriza(?:r)?|guarda", IntentType.LEARNING, 4.0),
        (r"simula(?:r)?|simulação|es+se", IntentType.SIMULATION, 4.0),
        (r"compara(?:r)?|diferença", IntentType.COMPARISON, 3.8),
        (r"cria(?:r)?|gera(?:r)?|desenha(?:r)?", IntentType.CREATION, 3.8),
        (r"define(?:r)?|significa", IntentType.DEFINITION, 3.8),
        (r"mostra(?:r)?|mostre|diz(?:e)?|encontra(?:r)?", IntentType.REQUEST, 3.0),
    )

    QUESTION_PREFIXES = (
        "o que", "o que é", "o que sao", "o que são", "quem", "qual", "quais",
        "onde", "quando", "como", "por que", "porque",
    )

    def detect(self, text: str, frame: object | None = None) -> SemanticIntent:
        if not isinstance(text, str):
            raise TypeError("text must be a string")
        normalized = re.sub(r"s+", " ", text.casefold().strip())
        if not normalized:
            raise ValueError("text must not be empty")

        signals: list[IntentSignal] = []
        scores: dict[IntentType, float] = {}

        for pattern, intent, weight in self.DIRECT_RULES:
            if re.search(pattern, normalized, re.I):
                signal = IntentSignal(pattern, intent, weight)
                signals.append(signal)
                scores[intent] = scores.get(intent, 0.0) + weight

        if normalized.endswith("?") or normalized.startswith(self.QUESTION_PREFIXES):
            signal = IntentSignal("question-form", IntentType.QUERY, 3.5)
            signals.append(signal)
            scores[IntentType.QUERY] = scores.get(IntentType.QUERY, 0.0) + 3.5

        # The legacy frame remains a compatibility signal, never the only
        # semantic-intent source.
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
            signal = IntentSignal(f"frame:{frame_intent}", mapped, 1.2)
            signals.append(signal)
            scores[mapped] = scores.get(mapped, 0.0) + 1.2

        if not scores:
            speech_act = "assertion"
            primary = IntentType.ASSERTION
            confidence = 0.55
            secondary: tuple[IntentType, ...] = ()
        else:
            ranked = sorted(scores.items(), key=lambda item: (-item[1], item[0].value))
            primary = ranked[0][0]
            total = sum(score for _, score in ranked)
            confidence = min(0.99, ranked[0][1] / total if total else 0.0)
            secondary = tuple(intent for intent, _ in ranked[1:4])
            speech_act = self._speech_act(primary, normalized)

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
    def _speech_act(primary: IntentType, text: str) -> str:
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
            r"^(?:o que|quem|qual|quais|onde|quando|como|por que|porque)s+",
            "",
            text,
            count=1,
        )
        cleaned = re.sub(
            r"^(?:calcula(?:r)?|calcule|explica(?:r)?|aprende(?:r)?|memoriza(?:r)?|simula(?:r)?|compara(?:r)?|cria(?:r)?|define(?:r)?|mostra(?:r)?|mostre)s+",
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

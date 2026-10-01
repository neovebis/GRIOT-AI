from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Iterable


@dataclass(frozen=True, slots=True)
class MetaphorCandidate:
    surface_pattern: str
    source_domain: str
    target_domain: str
    interpretation: str
    confidence: float
    cues: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class MetaphorResolution:
    text: str
    candidates: tuple[MetaphorCandidate, ...]
    chosen: MetaphorCandidate | None
    status: str

    @property
    def resolved(self) -> bool:
        return self.chosen is not None and self.status == "resolved"


class MetaphorResolver:
    """Explicit, conservative metaphor detector.

    B5 records interpretation hypotheses without replacing literal semantics.
    A detected metaphor remains an interpretation candidate unless its lexical
    and contextual cues provide enough support.
    """

    PATTERNS: tuple[tuple[str, str, str, str, tuple[str, ...]], ...] = (
        ("braço da empresa", "body", "organization", "organizational branch / extension", ("empresa", "organização", "organizacao", "departamento", "filial")),
        ("raiz do problema", "plant", "causality", "underlying cause / origin", ("problema", "causa", "origem", "questão", "questao")),
        ("coração da cidade", "body", "place", "central core / center", ("cidade", "centro", "praça", "praca")),
        ("teia de relações", "spiderweb", "social_network", "interconnected network", ("relações", "relacoes", "rede", "conexão", "conexao")),
        ("mar de gente", "sea", "crowd", "very large crowd", ("gente", "multidão", "multidao", "pessoas")),
        ("quebrar o gelo", "ice", "social_interaction", "reduce social tension", ("conversa", "reunião", "reuniao", "ambiente", "tensão", "tensao")),
        ("tempestade de emoções", "storm", "emotion", "intense emotional state", ("emoções", "emocoes", "sentimentos", "raiva", "medo", "alegria")),
    )

    def analyze(self, text: str) -> MetaphorResolution:
        if not isinstance(text, str):
            raise TypeError("text must be a string")
        normalized = text.casefold().strip()

        candidates: list[MetaphorCandidate] = []
        for pattern, source, target, interpretation, cues in self.PATTERNS:
            if not re.search(rf"(?<!\w){re.escape(pattern)}(?!\w)", normalized):
                continue
            matched = tuple(cue for cue in cues if cue in normalized)
            confidence = min(0.99, 0.60 + 0.08 * len(matched))
            candidates.append(
                MetaphorCandidate(
                    pattern,
                    source,
                    target,
                    interpretation,
                    confidence,
                    matched,
                )
            )

        if not candidates:
            return MetaphorResolution(text, (), None, "none")

        candidates.sort(
            key=lambda item: (-item.confidence, item.surface_pattern, item.interpretation)
        )
        top = candidates[0]
        return MetaphorResolution(text, tuple(candidates), top, "resolved")

    def analyze_many(self, texts: Iterable[str]) -> tuple[MetaphorResolution, ...]:
        return tuple(self.analyze(text) for text in texts)


__all__ = ["MetaphorCandidate", "MetaphorResolution", "MetaphorResolver"]

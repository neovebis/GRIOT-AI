from __future__ import annotations

from dataclasses import dataclass
import math
import re
from typing import Iterable, TYPE_CHECKING

if TYPE_CHECKING:
    from griot_engine import GRIOT


@dataclass(frozen=True, slots=True)
class SenseCandidate:
    surface: str
    sense: str
    quid: str
    score: float
    cues: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class AmbiguityResolution:
    surface: str
    candidates: tuple[SenseCandidate, ...]
    chosen: str | None
    confidence: float
    status: str

    @property
    def resolved(self) -> bool:
        return self.chosen is not None and self.status == "resolved"


@dataclass(frozen=True, slots=True)
class AmbiguityAnalysis:
    text: str
    resolutions: tuple[AmbiguityResolution, ...]

    @property
    def unresolved(self) -> tuple[AmbiguityResolution, ...]:
        return tuple(item for item in self.resolutions if not item.resolved)

    @property
    def resolved(self) -> tuple[AmbiguityResolution, ...]:
        return tuple(item for item in self.resolutions if item.resolved)


class AmbiguityResolver:
    """Deterministic lexical ambiguity resolver with explicit abstention.

    B1 handles context-sensitive alternatives for lexical forms with multiple
    documented senses. It does not pretend to solve full polysemy; B2 owns the
    richer sense-network model. When context cannot separate candidates, B1
    keeps the ambiguity explicit instead of inventing a winner.
    """

    LEXICON: dict[str, tuple[tuple[str, tuple[str, ...]], ...]] = {
        "banco": (
            ("bank_financial", ("dinheiro", "conta", "crédito", "credito", "empréstimo", "emprestimo", "juros", "finança", "financas", "financeiro")),
            ("bench_seat", ("parque", "madeira", "sentar", "assento", "praça", "praca", "jardim", "banco de jardim")),
        ),
        "vela": (
            ("candle", ("cera", "chama", "acender", "luz", "pavio")),
            ("sail", ("barco", "navio", "vento", "mar", "veleiro", "vela de barco")),
        ),
        "manga": (
            ("sleeve_clothing", ("camisa", "roupa", "casaco", "manga curta", "vestir")),
            ("manga_fruit", ("fruta", "sumo", "suco", "doce", "árvore", "mangueira")),
        ),
        "cabo": (
            ("cable", ("fio", "energia", "usb", "ligação", "ligacao", "carregador")),
            ("cape", ("mar", "costa", "praia", "promontório", "promontorio", "península", "peninsula")),
        ),
    }

    MIN_RESOLUTION_MARGIN = 0.75
    MIN_RESOLUTION_SCORE = 2.0

    def __init__(self, griot: GRIOT) -> None:
        self.griot = griot

    def analyze(
        self,
        text: str,
        *,
        context_records: Iterable[object] = (),
    ) -> AmbiguityAnalysis:
        if not isinstance(text, str):
            raise TypeError("text must be a string")
        normalized = text.casefold()

        context_terms: list[str] = []
        for record in context_records:
            gir = getattr(record, "gir", None)
            for node in getattr(gir, "nodes", ()):
                surface = getattr(node, "surface", "")
                if isinstance(surface, str):
                    context_terms.append(surface.casefold())

        combined = " ".join((normalized, *context_terms))
        surfaces = [
            surface
            for surface in self.LEXICON
            if re.search(rf"(?<!\w){re.escape(surface)}(?!\w)", normalized)
        ]
        resolutions = tuple(
            self._resolve_surface(surface, combined)
            for surface in sorted(set(surfaces))
        )
        return AmbiguityAnalysis(text, resolutions)

    def resolution_for(self, surface: str, analysis: AmbiguityAnalysis) -> AmbiguityResolution | None:
        key = surface.casefold().strip()
        for resolution in analysis.resolutions:
            if resolution.surface == key:
                return resolution
        return None

    def _resolve_surface(self, surface: str, context: str) -> AmbiguityResolution:
        candidate_specs = self.LEXICON[surface]
        candidates: list[SenseCandidate] = []

        for sense, cues in candidate_specs:
            matched = tuple(cue for cue in cues if cue in context)
            score = 1.0 + 2.0 * len(matched)
            label = f"ambiguity:{surface}:{sense}"
            quid = self.griot.quids.ensure(label)
            candidates.append(
                SenseCandidate(surface, sense, quid.symbol, score, matched)
            )

        candidates.sort(key=lambda item: (-item.score, item.sense))
        total = sum(math.exp(item.score) for item in candidates)
        top = candidates[0]
        confidence = math.exp(top.score) / total if total else 0.0
        margin = top.score - candidates[1].score if len(candidates) > 1 else float("inf")

        if top.score >= self.MIN_RESOLUTION_SCORE and margin >= self.MIN_RESOLUTION_MARGIN:
            return AmbiguityResolution(
                surface,
                tuple(candidates),
                top.sense,
                confidence,
                "resolved",
            )

        return AmbiguityResolution(
            surface,
            tuple(candidates),
            None,
            confidence,
            "ambiguous",
        )


__all__ = [
    "AmbiguityAnalysis",
    "AmbiguityResolution",
    "AmbiguityResolver",
    "SenseCandidate",
]

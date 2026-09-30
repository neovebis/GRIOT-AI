from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, TYPE_CHECKING

if TYPE_CHECKING:
    from griot_engine import GRIOT


@dataclass(frozen=True, slots=True)
class Mention:
    surface: str
    role: str
    sentence: int
    gender: str
    number: str
    quid: str | None = None


@dataclass(frozen=True, slots=True)
class CoreferenceCandidate:
    surface: str
    quid: str | None
    score: float
    reason: str


@dataclass(frozen=True, slots=True)
class CoreferenceLink:
    anaphor: str
    antecedent: str | None
    confidence: float
    status: str
    strategy: str
    candidates: tuple[CoreferenceCandidate, ...]

    @property
    def resolved(self) -> bool:
        return self.status == "resolved" and self.antecedent is not None


class CoreferenceResolver:
    """Deterministic discourse coreference with explicit abstention.

    Local mentions are preferred over older context. Agreement is a hard
    constraint for ordinary personal pronouns; unresolved ties stay ambiguous.
    """

    PRONOUNS = {
        "ele": ("masc", "sing"),
        "ela": ("fem", "sing"),
        "eles": ("masc", "plur"),
        "elas": ("fem", "plur"),
        "este": ("masc", "sing"),
        "esse": ("masc", "sing"),
        "esta": ("fem", "sing"),
        "essa": ("fem", "sing"),
        "isto": ("neut", "sing"),
        "isso": ("neut", "sing"),
        "aquilo": ("neut", "sing"),
    }

    AMBIGUITY_MARGIN = 0.70

    def __init__(self, griot: GRIOT) -> None:
        self.griot = griot

    def resolve(
        self,
        pronoun: str,
        mentions: Iterable[Mention],
        *,
        context_records: Iterable[object] = (),
    ) -> CoreferenceLink:
        key = pronoun.casefold().strip()
        context_records = tuple(context_records)
        agreement = self.PRONOUNS.get(key)
        if agreement is None:
            return CoreferenceLink(
                pronoun, None, 0.0, "unknown", "unsupported-pronoun", ()
            )

        candidates: list[CoreferenceCandidate] = []
        for rank, mention in enumerate(reversed(tuple(mentions))):
            score = self._score_local(mention, agreement, rank)
            if score > 0:
                candidates.append(
                    CoreferenceCandidate(
                        mention.surface,
                        mention.quid,
                        score,
                        f"local-{mention.role}-recency",
                    )
                )

        context_turn = 0
        for record in context_records:
            context_turn = max(context_turn, int(getattr(record, "turn", 0)))
        for record in sorted(
            tuple(context_records),
            key=lambda item: getattr(item, "turn", 0),
            reverse=True,
        ):
            turn = int(getattr(record, "turn", 0))
            gir = getattr(record, "gir", None)
            distance = max(1, context_turn - turn + 1)
            for node in reversed(tuple(getattr(gir, "nodes", ()))):
                surface = getattr(node, "surface", "")
                if not isinstance(surface, str):
                    continue
                gender, number = self.guess_agreement(surface)
                if self._agreement_matches(gender, number, agreement):
                    recency = 1.0 / distance
                    candidates.append(
                        CoreferenceCandidate(
                            surface,
                            getattr(node, "quid", None),
                            1.20 * recency,
                            "context-recency-agreement",
                        )
                    )

        candidates = self._dedupe_candidates(candidates)
        candidates.sort(key=lambda item: (-item.score, item.surface, item.quid or ""))
        if not candidates:
            return CoreferenceLink(pronoun, None, 0.0, "unresolved", "agreement-filter", ())

        top = candidates[0]
        second = candidates[1].score if len(candidates) > 1 else float("-inf")
        margin = top.score - second
        total = sum(candidate.score for candidate in candidates)
        confidence = top.score / total if total else 0.0

        if margin < self.AMBIGUITY_MARGIN:
            return CoreferenceLink(
                pronoun,
                None,
                confidence,
                "ambiguous",
                "recency-agreement-tie",
                tuple(candidates),
            )

        return CoreferenceLink(
            pronoun,
            top.surface,
            confidence,
            "resolved",
            top.reason,
            tuple(candidates),
        )

    @staticmethod
    def _score_local(
        mention: Mention,
        agreement: tuple[str, str],
        rank: int,
    ) -> float:
        if not CoreferenceResolver._agreement_matches(
            mention.gender, mention.number, agreement
        ):
            return 0.0
        role_bonus = 1.0 if mention.role == "subject" else 0.0
        recency_bonus = 1.60 / (rank + 1)
        return 2.0 + role_bonus + recency_bonus

    @staticmethod
    def _agreement_matches(gender: str, number: str, agreement: tuple[str, str]) -> bool:
        expected_gender, expected_number = agreement
        if expected_gender != "neut" and gender != expected_gender:
            return False
        return number == expected_number

    @staticmethod
    def guess_agreement(surface: str) -> tuple[str, str]:
        value = surface.casefold().strip()
        plural = value.endswith("s") and len(value) > 2
        number = "plur" if plural else "sing"

        if value.endswith(("a", "ção", "dade", "tade", "gem", "ice")):
            return "fem", number
        if value.endswith(("o", "or", "ão")):
            return "masc", number

        known = {
            "leão": ("masc", "sing"),
            "lobo": ("masc", "sing"),
            "humano": ("masc", "sing"),
            "animal": ("masc", "sing"),
            "árvore": ("fem", "sing"),
            "presa": ("fem", "sing"),
            "empresa": ("fem", "sing"),
            "conta": ("fem", "sing"),
            "folhas": ("fem", "plur"),
            "animais": ("masc", "plur"),
        }
        return known.get(value, ("unknown", number))

    @staticmethod
    def _dedupe_candidates(
        candidates: Iterable[CoreferenceCandidate],
    ) -> list[CoreferenceCandidate]:
        best: dict[tuple[str, str | None], CoreferenceCandidate] = {}
        for candidate in candidates:
            key = (candidate.surface, candidate.quid)
            current = best.get(key)
            if current is None or candidate.score > current.score:
                best[key] = candidate
        return list(best.values())


__all__ = [
    "CoreferenceCandidate",
    "CoreferenceLink",
    "CoreferenceResolver",
    "Mention",
]

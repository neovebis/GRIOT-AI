from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from griot_ambiguity import AmbiguityAnalysis, AmbiguityResolver

if TYPE_CHECKING:
    from griot_engine import GRIOT


@dataclass(frozen=True, slots=True)
class PolysemyLink:
    surface: str
    source_sense: str
    target_sense: str
    relation: str
    confidence: float


@dataclass(frozen=True, slots=True)
class PolysemyFamily:
    surface: str
    senses: tuple[str, ...]
    links: tuple[PolysemyLink, ...]


@dataclass(frozen=True, slots=True)
class PolysemyAnalysis:
    text: str
    families: tuple[PolysemyFamily, ...]

    @property
    def links(self) -> tuple[PolysemyLink, ...]:
        return tuple(link for family in self.families for link in family.links)


class PolysemyResolver:
    """Explicit network of related senses without QUID conflation.

    B2 represents systematic sense relationships. A link is semantic metadata,
    not a license to treat two sense QUIDs as identical or to transfer arbitrary
    graph facts between them.
    """

    FAMILY_LINKS: dict[str, tuple[tuple[str, str, str, float], ...]] = {
        "cabeça": (
            ("head_body", "head_leader", "metonymic_extension", 0.86),
            ("head_body", "head_front", "spatial_extension", 0.74),
            ("head_leader", "head_front", "organizational_spatial_extension", 0.62),
        ),
        "braço": (
            ("arm_body", "arm_branch", "structural_metonymy", 0.84),
            ("arm_branch", "arm_support", "functional_extension", 0.72),
        ),
        "raiz": (
            ("root_plant", "root_math", "conceptual_extension", 0.82),
            ("root_plant", "root_word", "conceptual_extension", 0.79),
            ("root_math", "root_word", "structural_analogy", 0.65),
        ),
        "linha": (
            ("line_geometry", "line_telephone", "functional_extension", 0.72),
            ("line_geometry", "line_lineage", "structural_extension", 0.70),
            ("line_telephone", "line_lineage", "network_extension", 0.58),
        ),
    }

    def __init__(self, griot: GRIOT) -> None:
        self.griot = griot
        self.ambiguity = AmbiguityResolver(griot)

    def analyze(
        self,
        text: str,
        ambiguity: AmbiguityAnalysis | None = None,
    ) -> PolysemyAnalysis:
        ambiguity = ambiguity or self.ambiguity.analyze(
            text,
            context_records=self.griot.context.records(),
        )

        families: list[PolysemyFamily] = []
        for resolution in ambiguity.resolutions:
            specs = self.FAMILY_LINKS.get(resolution.surface)
            if not specs:
                continue
            senses = tuple(sorted({sense for sense, _, _, _ in specs} | {
                target for _, _, target, _ in specs
            }))
            links = tuple(
                PolysemyLink(
                    resolution.surface,
                    source_sense,
                    target_sense,
                    relation,
                    confidence,
                )
                for source_sense, target_sense, relation, confidence in specs
            )
            families.append(
                PolysemyFamily(
                    resolution.surface,
                    senses,
                    links,
                )
            )
        return PolysemyAnalysis(text, tuple(families))

    def related(self, surface: str, sense: str) -> tuple[PolysemyLink, ...]:
        key = surface.casefold()
        family = next(
            (family for family in self.analyze(surface).families if family.surface == key),
            None,
        )
        if family is None:
            return ()
        return tuple(
            link
            for link in family.links
            if link.source_sense == sense or link.target_sense == sense
        )

    def quids_for(self, surface: str, analysis: AmbiguityAnalysis) -> dict[str, str]:
        resolution = self.ambiguity.resolution_for(surface, analysis)
        if resolution is None:
            return {}
        return {
            candidate.sense: candidate.quid
            for candidate in resolution.candidates
        }


__all__ = [
    "PolysemyAnalysis",
    "PolysemyFamily",
    "PolysemyLink",
    "PolysemyResolver",
]

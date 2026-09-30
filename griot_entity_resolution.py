from __future__ import annotations

from dataclasses import dataclass
import re
import unicodedata
from typing import Mapping

from griot_engine import BaseLayer, QUID, QUIDRegistry


@dataclass(frozen=True, slots=True)
class EntityResolution:
    surface: str
    quid: str
    canonical_label: str
    status: str
    confidence: float


@dataclass(frozen=True, slots=True)
class EntityResolutionReport:
    entities: tuple[EntityResolution, ...]

    @property
    def created(self) -> tuple[EntityResolution, ...]:
        return tuple(item for item in self.entities if item.status == "created")

    @property
    def resolved(self) -> tuple[EntityResolution, ...]:
        return tuple(item for item in self.entities if item.status in {"existing", "created"})

    @property
    def unresolved(self) -> tuple[EntityResolution, ...]:
        return tuple(item for item in self.entities if item.status == "unresolved")


class EntityResolver:
    """Deterministic entity resolution with conservative lexical matching.

    The resolver deliberately avoids fuzzy merges. It accepts exact registry
    matches and accent/punctuation-insensitive label or alias matches; a truly
    unseen surface becomes a new QUID instead of being guessed as another entity.
    """

    @staticmethod
    def normalize(surface: str) -> str:
        value = unicodedata.normalize("NFKD", surface.casefold())
        value = "".join(ch for ch in value if not unicodedata.combining(ch))
        value = re.sub(r"[^\\w]+", " ", value, flags=re.UNICODE)
        return re.sub(r"\\s+", " ", value).strip()

    def __init__(self, registry: QUIDRegistry) -> None:
        self.registry = registry

    def resolve(
        self,
        surface: str,
        *,
        family_id: int = 1,
        base: BaseLayer = BaseLayer.RICH,
    ) -> EntityResolution:
        if not isinstance(surface, str):
            raise TypeError("surface must be a string")
        clean = surface.strip()
        if not clean:
            raise ValueError("surface must not be empty")

        exact = self.registry.get(clean)
        if exact is not None:
            return EntityResolution(clean, exact.symbol, exact.label, "existing", 1.0)

        normalized = self.normalize(clean)
        for quid in self.registry.all():
            labels = (quid.label, *tuple(quid.metadata.get("aliases", ())))
            if any(self.normalize(label) == normalized for label in labels if isinstance(label, str)):
                return EntityResolution(clean, quid.symbol, quid.label, "existing", 0.99)

        created = self.registry.ensure(clean, base=base, family_id=family_id)
        return EntityResolution(clean, created.symbol, created.label, "created", 0.95)

    def resolve_quid(self, symbol: str) -> EntityResolution:
        quid = self.registry.get(symbol)
        if quid is None:
            return EntityResolution(symbol, symbol, symbol, "unresolved", 0.0)
        return self.resolve(quid.label, family_id=quid.family_id, base=quid.base)

    def resolve_mapping(
        self,
        surfaces: Mapping[str, int],
    ) -> EntityResolutionReport:
        items = tuple(
            self.resolve(surface, family_id=family)
            for surface, family in sorted(surfaces.items())
        )
        return EntityResolutionReport(items)


__all__ = [
    "EntityResolution",
    "EntityResolutionReport",
    "EntityResolver",
]

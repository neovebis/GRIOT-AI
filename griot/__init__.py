"""Compatibility namespace for historical GRIOT modules."""

from .engine import GRIOT
from .types import (
    BaseLayer,
    Fact,
    Family,
    Inference,
    Proposition,
    QUID,
    QueryResult,
    Scene,
    SemanticFrame,
)

__all__ = [
    "GRIOT",
    "BaseLayer",
    "Fact",
    "Family",
    "Inference",
    "Proposition",
    "QUID",
    "QueryResult",
    "Scene",
    "SemanticFrame",
]

"""Legacy-compatible facade for the canonical GRIOT engine.

The historical griot.engine.GRIOT() constructor remains supported without
changing the canonical griot_engine.GRIOT dataclass constructor.
"""
from __future__ import annotations

from griot_engine import GRIOT as _GRIOT


class GRIOT:
    @staticmethod
    def create(dimension: int = 64):
        return _GRIOT.create(dimension)

    def __new__(cls, *args, **kwargs):
        if not args and not kwargs:
            return _GRIOT.create()
        return _GRIOT(*args, **kwargs)


__all__ = ["GRIOT"]

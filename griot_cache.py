from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from typing import Generic, TypeVar


T = TypeVar("T")


@dataclass(frozen=True, slots=True)
class CacheStats:
    hits: int
    misses: int
    evictions: int
    size: int


class GenerationCache(Generic[T]):
    """Bounded LRU cache invalidated by an explicit knowledge generation."""

    def __init__(self, capacity: int = 256) -> None:
        if not isinstance(capacity, int) or isinstance(capacity, bool) or capacity <= 0:
            raise ValueError("capacity must be a positive integer")
        self.capacity = capacity
        self._generation = 0
        self._items: OrderedDict[object, tuple[int, T]] = OrderedDict()
        self._hits = 0
        self._misses = 0
        self._evictions = 0

    @property
    def generation(self) -> int:
        return self._generation

    def invalidate(self) -> None:
        self._generation += 1
        self._items.clear()

    def get(self, key: object) -> T | None:
        entry = self._items.get(key)
        if entry is None or entry[0] != self._generation:
            self._misses += 1
            return None
        self._items.move_to_end(key)
        self._hits += 1
        return entry[1]

    def put(self, key: object, value: T) -> None:
        if key in self._items:
            self._items.pop(key)
        self._items[key] = (self._generation, value)
        self._items.move_to_end(key)
        while len(self._items) > self.capacity:
            self._items.popitem(last=False)
            self._evictions += 1

    def stats(self) -> CacheStats:
        return CacheStats(
            self._hits,
            self._misses,
            self._evictions,
            len(self._items),
        )


__all__ = ["CacheStats", "GenerationCache"]

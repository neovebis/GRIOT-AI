from __future__ import annotations

from dataclasses import dataclass

from quid_core import Quid, QuidAnalysis


@dataclass(frozen=True, slots=True)
class RuntimeHealth:
    stages: tuple[str, ...]
    ready: bool
    missing: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class RuntimeAnalysis:
    result: QuidAnalysis
    stages: tuple[str, ...]
    integrated: bool


class GRIOTRuntime:
    """Single public runtime facade for the integrated GRIOT architecture."""

    STAGES = (
        "semantic_intent",
        "gir",
        "ambiguity",
        "polysemy",
        "coreference",
        "discourse_context",
        "query_planner",
        "working_graph",
        "reasoning",
        "epistemic",
        "verification",
    )

    def __init__(self, quid: Quid | None = None) -> None:
        self.quid = quid or Quid()

    def analyze(self, text: str) -> RuntimeAnalysis:
        result = self.quid.analisar(text)
        integrated = all(
            (
                result.gir is not None,
                result.intent is not None,
                result.discourse is not None,
                result.query_plan is not None,
                result.working_graph is not None,
                result.reasoning is not None,
                result.epistemic is not None,
                result.verification is not None,
            )
        )
        return RuntimeAnalysis(result, self.STAGES, integrated)

    def health(self) -> RuntimeHealth:
        missing = []
        required = {
            "semantic_intent": getattr(self.quid.semantic, "intent", None),
            "ambiguity": getattr(self.quid.semantic, "ambiguity", None),
            "polysemy": getattr(self.quid.semantic, "polysemy", None),
            "coreference": getattr(self.quid.semantic, "coreference", None),
            "discourse_context": getattr(self.quid.engine, "discourse", None),
            "query_planner": getattr(self.quid, "query_planner", None),
            "working_graph": getattr(self.quid, "query_planner", None),
            "reasoning": getattr(self.quid, "reasoning", None),
            "epistemic": getattr(self.quid, "epistemic", None),
            "verification": getattr(self.quid, "verifier", None),
        }
        for stage in self.STAGES:
            if required.get(stage) is None:
                missing.append(stage)
        return RuntimeHealth(self.STAGES, not missing, tuple(missing))

    def ask(self, text: str):
        return self.quid.engine.ask(text)

    def learn(self, text: str, *, source: str):
        return self.quid.incremental_learn(text, source=source)

    def persist(self, path: str) -> None:
        self.quid.persist_storage(path)

    @classmethod
    def from_storage(cls, path: str) -> "GRIOTRuntime":
        return cls(Quid.from_storage(path))


__all__ = ["GRIOTRuntime", "RuntimeAnalysis", "RuntimeHealth"]

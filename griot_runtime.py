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
        "execution_control",
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
        components = {
            "semantic_intent": lambda: self.quid.semantic.compiler.intent,
            "ambiguity": lambda: self.quid.semantic.compiler.ambiguity,
            "polysemy": lambda: self.quid.semantic.compiler.polysemy,
            "coreference": lambda: self.quid.semantic.compiler.coreference,
            "discourse_context": lambda: self.quid.engine.discourse,
            "gir": lambda: self.quid.semantic.compiler,
            "query_planner": lambda: self.quid.query_planner,
            "working_graph": lambda: self.quid.query_planner.retriever if hasattr(self.quid.query_planner, "retriever") else None,
            "reasoning": lambda: self.quid.reasoning,
            "epistemic": lambda: self.quid.epistemic,
            "verification": lambda: self.quid.verifier,
            "execution_control": lambda: self.quid.execution,
        }
        missing = []
        for stage in self.STAGES:
            try:
                value = components[stage]()
            except (AttributeError, TypeError):
                value = None
            if value is None:
                missing.append(stage)
        return RuntimeHealth(self.STAGES, not missing, tuple(missing))

    def execute_next(
        self,
        text: str,
        *,
        decompose: bool = True,
        hypothesis_limit: int = 8,
        max_hops: int = 8,
    ):
        return self.quid.executar_proximo_passo(
            text,
            decompose=decompose,
            hypothesis_limit=hypothesis_limit,
            max_hops=max_hops,
        )

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

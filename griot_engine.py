

@dataclass(slots=True)
class GRIOT:
    kernel: NumericKernel | None = None
    quids: QUIDRegistry | None = None
    graph: KnowledgeGraph | None = None
    interpreter: SemanticInterpreter | None = None
    learner: TextLearner | None = None
    scenes: SceneBuilder | None = None
    simulator: Simulator | None = None
    version: str = "0.1.0"
    context: ContextEngine = field(default_factory=ContextEngine)
    discourse: DiscourseContextEngine = field(default_factory=DiscourseContextEngine)

    def __post_init__(self) -> None:
        if self.kernel is None:
            built = type(self).create()
            self.kernel = built.kernel
            self.quids = built.quids
            self.graph = built.graph
            self.interpreter = built.interpreter
            self.learner = built.learner
            self.scenes = built.scenes
            self.simulator = built.simulator
            return

        if any(
            value is None
            for value in (
                self.quids,
                self.graph,
                self.interpreter,
                self.learner,
                self.scenes,
                self.simulator,
            )
        ):
            raise ValueError("GRIOT components must be complete")

    @classmethod
    def create(cls, dimension: int = 64) -> "GRIOT":
        kernel = NumericKernel(dimension)
        registry = QUIDRegistry(kernel)
        registry.load(_builtins(kernel))
        graph = KnowledgeGraph()
        graph.add_rule("type_transitivity", "is_a", "is_a", "is_a")
        graph.add_rule("part_transitivity", "part_of", "part_of", "part_of")
        graph.add_rule("causal_chain", "causes", "causes", "causes")
        interpreter = SemanticInterpreter(registry, kernel)
        return cls(kernel, registry, graph, interpreter, TextLearner(registry, graph, interpreter), SceneBuilder(registry, graph), Simulator())

    def understand(self, text: str) -> SemanticFrame:
        return self.interpreter.intent(text)

    def analisar(self, text: str):
        """Run the unified A1 semantic + proof pipeline."""
        from quid_core import Quid

        return Quid(self).analisar(text)

    def learn(self, text: str, source: str = "text") -> LearningEvent:
        return self.learner.ingest(text, source)

    def ask(self, text: str) -> QueryResult:
        """Compatibility API backed entirely by the unified A1 pipeline."""
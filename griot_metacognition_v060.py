                        "prediction",
                        f"derived from {seed.relation} + {second}",
                    )
                    out[(predicted.subject, predicted.relation, predicted.object)] = predicted
        return sorted(out.values(), key=lambda f: (f.relation, f.object))

    @staticmethod
    def _clone_engine(source: GRIOT) -> GRIOT:
        sandbox = GRIOT.create(dimension=source.kernel.dimension)
        builtin_codes = {q.code for q in sandbox.quids.all()}
        builtin_symbols = {q.symbol for q in sandbox.quids.all()}
        for q in source.quids.all():
            if q.code in builtin_codes or q.symbol in builtin_symbols:
                continue
            sandbox.quids.load((q,))
        for fact in source.graph.facts():
            sandbox.graph.add_fact(fact)
        return sandbox

    @staticmethod
    def _label(engine: GRIOT, symbol: str) -> str:
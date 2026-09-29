import unittest

from griot_engine import GRIOT
from griot_gir import GIR, GIR_SCHEMA_VERSION, MeaningEdge, MeaningNode
from griot_semantic_ir import MeaningRepresentation, SemanticGRIOT


class GIRContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GRIOT.create()
        self.semantic = SemanticGRIOT(self.engine)

    def test_compiler_emits_formal_gir_contract(self) -> None:
        gir = self.semantic.understand("O leão é um animal.")
        self.assertIsInstance(gir, GIR)
        self.assertIsInstance(gir, MeaningRepresentation)
        gir.validate()
        self.assertEqual(gir.schema_version, GIR_SCHEMA_VERSION)
        self.assertTrue(gir.fingerprint())

    def test_round_trip_preserves_canonical_representation(self) -> None:
        gir = self.semantic.understand("O leão ataca o lobo amanhã.")
        encoded = gir.canonical_json()
        restored = GIR.from_json(encoded)
        self.assertEqual(restored.canonical_json(), encoded)
        self.assertEqual(restored.fingerprint(), gir.fingerprint())
        self.assertEqual(restored.facts(), gir.facts())

    def test_serialization_is_order_independent_for_nodes_and_edges(self) -> None:
        base = self.semantic.understand("O leão é um animal.")
        reversed_gir = MeaningRepresentation(
            base.text,
            base.frame,
            tuple(reversed(base.nodes)),
            tuple(reversed(base.edges)),
            base.vector,
            dict(base.constraints),
            base.schema_version,
            base.provenance,
        )
        self.assertEqual(reversed_gir.canonical_json(), base.canonical_json())

    def test_edges_cannot_reference_missing_nodes(self) -> None:
        with self.assertRaises(ValueError):
            MeaningRepresentation(
                "x",
                self.semantic.engine.understand("x"),
                (MeaningNode("q:a", "🦁", "leão", "entity", 1),),
                (MeaningEdge("q:a", "is_a", "q:missing", 1),),
                (),
                {},
            )

    def test_known_relation_family_cannot_be_inconsistent(self) -> None:
        with self.assertRaises(ValueError):
            MeaningRepresentation(
                "x",
                self.semantic.engine.understand("x"),
                (
                    MeaningNode("q:a", "🦁", "leão", "entity", 1),
                    MeaningNode("q:b", "🐺", "lobo", "entity", 1),
                ),
                (MeaningEdge("q:a", "is_a", "q:b", 2),),
                (),
                {},
            )

    def test_qid_reference_and_confidence_invariants_are_enforced(self) -> None:
        with self.assertRaises(ValueError):
            MeaningRepresentation(
                "x",
                self.semantic.engine.understand("x"),
                (MeaningNode("q:a", "ab", "x", "entity", 1),),
                (),
                (),
                {},
            )
        with self.assertRaises(ValueError):
            MeaningRepresentation(
                "x",
                self.semantic.engine.understand("x"),
                (MeaningNode("q:a", "🦁", "x", "entity", 1, 1.5),),
                (),
                (),
                {},
            )

    def test_constraints_and_provenance_are_part_of_the_contract(self) -> None:
        gir = MeaningRepresentation(
            "x",
            self.semantic.engine.understand("x"),
            (MeaningNode("q:a", "🦁", "leão", "entity", 1),),
            (),
            (0.1, 0.2),
            {"nested": {"values": [1, 2]}},
            GIR_SCHEMA_VERSION,
            ("compiler", "source:test"),
        )
        self.assertEqual(gir.constraints["nested"]["values"], (1, 2))
        with self.assertRaises(TypeError):
            gir.constraints["new"] = 1  # type: ignore[index]
        self.assertEqual(gir.provenance, ("compiler", "source:test"))
        restored = GIR.from_dict(gir.to_dict())
        self.assertEqual(restored.constraints["nested"]["values"], (1, 2))
        self.assertEqual(restored.provenance, gir.provenance)


if __name__ == "__main__":
    unittest.main()

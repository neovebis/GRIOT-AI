import unittest

from griot_engine import BaseLayer, FAMILIES, GRIOT


class GriotEngineTests(unittest.TestCase):
    def setUp(self):
        self.g = GRIOT.create()

    def test_exactly_ten_families_and_four_bases(self):
        self.assertEqual(set(FAMILIES), set(range(1, 11)))
        state = self.g.state()
        self.assertEqual(set(state["bases"]), {b.value for b in BaseLayer})
        self.assertGreaterEqual(state["quids"], 50)

    def test_every_quid_is_one_character(self):
        self.assertTrue(all(len(q.symbol) == 1 for q in self.g.quids.all()))

    def test_lion_is_one_quid_with_aliases(self):
        lion = self.g.quids.get("leão")
        self.assertIsNotNone(lion)
        self.assertEqual(lion.symbol, "🦁")
        self.assertIs(lion, self.g.quids.get("Panthera leo"))
        self.assertIs(lion, self.g.quids.get("lion"))

    def test_learning_and_transitive_reasoning(self):
        event = self.g.learn(
            "O leão é um animal. O animal é um ser vivo. O leão tem juba.",
            "unit-test",
        )
        self.assertEqual(event.facts_added, 3)
        self.assertTrue(self.g.ask("leão é um animal").answer)
        self.assertTrue(self.g.ask("leão é um ser vivo").answer)
        self.assertTrue(self.g.ask("leão tem juba").answer)

    def test_numeric_kernel(self):
        self.assertEqual(self.g.calculate("2**10 + 5"), 1029)
        self.assertAlmostEqual(self.g.kernel.determinant([[1, 2], [3, 4]]), -2.0)
        solution = self.g.kernel.solve_linear([[2, 1], [1, 3]], [7, 11])
        self.assertAlmostEqual(solution[0], 2.0)
        self.assertAlmostEqual(solution[1], 3.0)

    def test_intent(self):
        self.assertEqual(self.g.understand("calcula 2 + 2").intent, "calculate")
        self.assertEqual(self.g.understand("simula o cenário").intent, "simulate")

    def test_dynamic_quid_and_scene(self):
        scene = self.g.compose_scene("ataque do leão", ("🦁", "⚔"))
        self.assertEqual(len(scene.quid.symbol), 1)
        self.assertEqual(scene.quid.base, BaseLayer.SCENE)
        self.assertEqual(len(scene.components), 2)


if __name__ == "__main__":
    unittest.main()

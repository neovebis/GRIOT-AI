import unittest

from griot_engine import GRIOT
from griot_runtime import GRIOTRuntime


class F8HeadValidation(unittest.TestCase):
    def test_head_runtime_smoke(self) -> None:
        engine = GRIOT.create()
        engine.learn("O leão é um animal.", source="head")
        runtime = GRIOTRuntime()
        result = runtime.analyze("leão é um animal")

        self.assertTrue(result.integrated)
        self.assertTrue(result.result.answer)
        self.assertTrue(result.result.verification.ok)

if __name__ == "__main__":
    unittest.main()

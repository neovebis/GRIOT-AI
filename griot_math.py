from __future__ import annotations

import ast
from dataclasses import dataclass
from fractions import Fraction
import math
import re

from griot_engine import GRIOT


class MathStatus(str):
    EXACT = "exact"
    APPROXIMATE = "approximate"
    INVALID = "invalid"


@dataclass(frozen=True, slots=True)
class MathResult:
    expression: str
    value: int | float | Fraction | None
    exact: bool
    status: str
    steps: tuple[str, ...]
    confidence: float
    error: str | None = None


class MathEngine:
    """Deterministic arithmetic layer using exact rational evaluation where possible."""

    PREFIXES = (
        r"^\s*(?:calcula(?:r)?|calcule|quanto\s+(?:é|e)|qual\s+é|resolva)\s*",
    )
    SAFE_TEXT = re.compile(r"^[0-9A-Za-z_ππτ+\-*/%().,\s]+$")

    def __init__(self, engine: GRIOT | None = None) -> None:
        self.engine = engine or GRIOT.create()

    def extract_expression(self, text: str) -> str:
        if not isinstance(text, str):
            raise TypeError("text must be a string")
        value = text.strip()
        for pattern in self.PREFIXES:
            value = re.sub(pattern, "", value, count=1, flags=re.I)
        value = value.strip(" .?!")
        value = value.replace(",", ".")
        value = re.sub(
            r"\b(?:por\s+favor|porfavor|me\s+diga|diz-me|diga-me)\b",
            " ",
            value,
            flags=re.I,
        )
        value = re.sub(r"\s+", " ", value).strip()
        if not self.SAFE_TEXT.fullmatch(value):
            raise ValueError("text does not contain a supported mathematical expression")
        return value

    def calculate(self, text: str) -> MathResult:
        expression = self.extract_expression(text)
        return self.evaluate(expression)

    def evaluate(self, expression: str) -> MathResult:
        if not isinstance(expression, str):
            raise TypeError("expression must be a string")
        expression = expression.strip()
        if not expression:
            return MathResult("", None, False, MathStatus.INVALID, (), 0.0, "empty expression")

        try:
            tree = ast.parse(expression, mode="eval")
            exact_value = self._exact_node(tree.body)
            if exact_value is not None:
                rendered = self._render(exact_value)
                return MathResult(
                    expression,
                    exact_value.numerator if exact_value.denominator == 1 else exact_value,
                    True,
                    MathStatus.EXACT,
                    (f"{expression} = {rendered}",),
                    1.0,
                )

            value = self.engine.kernel.safe_eval(expression)
            value = float(value)
            if not math.isfinite(value):
                raise ValueError("non-finite result")
            return MathResult(
                expression,
                value,
                False,
                MathStatus.APPROXIMATE,
                (f"{expression} ≈ {value:.12g}",),
                0.96,
            )
        except (SyntaxError, ValueError, TypeError, ZeroDivisionError, OverflowError) as exc:
            return MathResult(
                expression,
                None,
                False,
                MathStatus.INVALID,
                (),
                0.0,
                str(exc),
            )

    def _exact_node(self, node: ast.AST) -> Fraction | None:
        if isinstance(node, ast.Constant) and isinstance(node.value, int) and not isinstance(node.value, bool):
            return Fraction(node.value)

        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = self._exact_node(node.operand)
            if value is None:
                return None
            return value if isinstance(node.op, ast.UAdd) else -value

        if isinstance(node, ast.BinOp):
            left = self._exact_node(node.left)
            right = self._exact_node(node.right)
            if left is None or right is None:
                return None
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                return left / right
            if isinstance(node.op, ast.FloorDiv):
                return Fraction(left // right)
            if isinstance(node.op, ast.Mod):
                return left % right
            if isinstance(node.op, ast.Pow):
                if right.denominator != 1 or abs(right.numerator) > 10000:
                    return None
                return left ** right.numerator
            return None
        return None

    @staticmethod
    def _render(value: Fraction) -> str:
        return (
            str(value.numerator)
            if value.denominator == 1
            else f"{value.numerator}/{value.denominator}"
        )


__all__ = ["MathEngine", "MathResult", "MathStatus"]

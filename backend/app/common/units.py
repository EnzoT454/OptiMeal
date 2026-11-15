"""Conversions certaines et quantités exactes, sans densité ou format inventé."""
from dataclasses import dataclass
from decimal import Decimal, localcontext
from fractions import Fraction


FACTORS = {
    'g': ('g', 1), 'kg': ('g', 1000), 'ml': ('ml', 1), 'L': ('ml', 1000),
    'unit': ('unit', 1), 'cup': ('ml', 250), 'tbsp': ('ml', 15), 'tsp': ('ml', 5),
}
REPEATING_DECIMAL_PLACES = 6


@dataclass(frozen=True)
class NormalizedQuantity:
    amount: Decimal
    unit: str
    rounded: bool = False


def quantity_fraction(amount: Decimal, unit: str, *, servings: int = 1,
                      recipe_servings: int = 1) -> tuple[Fraction, str]:
    if not isinstance(amount, Decimal) or not amount.is_finite() or amount <= 0:
        raise ValueError('Quantité décimale finie et positive requise.')
    if (type(servings) is not int or type(recipe_servings) is not int or
            servings <= 0 or recipe_servings <= 0):
        raise ValueError('Les portions doivent être des entiers strictement positifs.')
    if unit not in FACTORS:
        raise ValueError('Unité sans conversion certaine.')
    normalized_unit, factor = FACTORS[unit]
    return Fraction(amount) * factor * Fraction(servings, recipe_servings), normalized_unit


def decimal_quantity(value: Fraction) -> tuple[Decimal, bool]:
    """Exact si décimal fini ; sinon plafond à six décimales, jamais par défaut."""
    if value <= 0:
        raise ValueError('Quantité strictement positive requise.')
    denominator = value.denominator
    for factor in (2, 5):
        while denominator % factor == 0:
            denominator //= factor
    if denominator == 1:
        with localcontext() as context:
            # Suffisant même pour une longue fraction décimale déjà fournie.
            context.prec = len(str(value.numerator)) + len(str(value.denominator)) + 2
            return Decimal(value.numerator) / Decimal(value.denominator), False
    scale = 10 ** REPEATING_DECIMAL_PLACES
    ceiling = (value.numerator * scale + value.denominator - 1) // value.denominator
    return Decimal(f'{ceiling // scale}.{ceiling % scale:0{REPEATING_DECIMAL_PLACES}d}'), True


def normalize_quantity(amount: Decimal, unit: str) -> NormalizedQuantity:
    value, normalized_unit = quantity_fraction(amount, unit)
    normalized, rounded = decimal_quantity(value)
    return NormalizedQuantity(normalized, normalized_unit, rounded)

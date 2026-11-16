"""Couverture bornée d'un besoin regroupé, sans écriture ni comparaison HTTP.

Les références sont combinées dans un seul magasin. Une recherche exhaustive
bornée garantit le minimum dans ce périmètre ; un dépassement ne livre aucun
minimum approximatif. Quantités et tarifs intermédiaires sont des fractions
exactes ; seuls les montants finaux par référence sont arrondis au centime.
"""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, localcontext
from fractions import Fraction
from itertools import product
from math import prod
from typing import Literal

from backend.app.catalog.pricing import purchase_total
from backend.app.catalog.sales import NormalizedSale, normalize_sale
from backend.app.common.units import decimal_quantity, quantity_fraction
from .schemas import ShoppingQuantity


@dataclass(frozen=True)
class SearchLimits:
    max_references: int = 12
    max_options: int = 10_000
    max_combinations: int = 100_000

    def __post_init__(self):
        if any(type(v) is not int or v < 1 for v in (
                self.max_references, self.max_options, self.max_combinations)):
            raise ValueError('Les limites doivent être des entiers positifs.')


@dataclass(frozen=True)
class PurchaseLine:
    sale: NormalizedSale
    sale_units: int  # paquets, ou nombre de pas pour les ventes mesurées
    quantity: str  # contenu total dans l'unité canonique du résultat
    amount: str  # CAD, hors taxes et consignes non documentées
    estimated_weight: bool


@dataclass(frozen=True)
class StoreCoverage:
    retailer: str
    store_id: str | None
    status: Literal['complete', 'search_limit', 'no_eligible_product']
    lines: tuple[PurchaseLine, ...] = ()
    amount: str | None = None
    surplus: str | None = None
    combinations: int = 0


@dataclass(frozen=True)
class CoverageResult:
    ingredient_id: str
    evaluated_on: date
    status: Literal['calculated', 'already_covered', 'incompatible_units', 'unquantified']
    unit: str | None
    remaining: str | None
    stores: tuple[StoreCoverage, ...] = ()
    excluded: tuple[tuple[str, tuple[str, ...]], ...] = ()
    # Si un magasin dépasse les bornes, aucun meilleur magasin n'est annoncé.
    best: StoreCoverage | None = None


def _ceil(value: Fraction) -> int:
    return -(-value.numerator // value.denominator)


def _quantity(value: Fraction) -> str:
    if not value:
        return '0'
    amount, rounded = decimal_quantity(value)
    if rounded:
        raise ValueError('Une quantité de vente doit être une décimale finie.')
    return format(amount, 'f')


def _cents(value: Fraction) -> int:
    # ROUND_HALF_UP exact, indépendant du contexte Decimal du processus.
    scaled = value * 100
    return (2 * scaled.numerator + scaled.denominator) // (2 * scaled.denominator)


def _money(cents: int) -> str:
    return f'{cents // 100}.{cents % 100:02d}'


def _vector(quantities: list[ShoppingQuantity]) -> dict[str, Fraction]:
    result: dict[str, Fraction] = {}
    for quantity in quantities:
        amount, unit = quantity_fraction(Decimal(quantity.amount), quantity.unit)
        result[unit] = result.get(unit, Fraction()) + amount
    return result


def _line_cost(sale: NormalizedSale, count: int, reserved: int = 0) -> int:
    if sale.price_basis == 'package':
        # Réutiliser le même tarif et les mêmes dates que les offres. La
        # précision inclut tous les chiffres source et le nombre de paquets.
        prices = (sale.raw_source.price, sale.raw_source.promo_price,
                  sale.raw_source.price_after_limit)
        with localcontext() as context:
            context.prec = max(len(p) for p in prices if p is not None) + len(str(count + reserved)) + 10
            amount = purchase_total(sale.raw_source, count + reserved, sale.evaluated_on)
            before = purchase_total(sale.raw_source, reserved, sale.evaluated_on) if reserved else Decimal(0)
        assert amount is not None
        return _cents(Fraction(amount)) - _cents(Fraction(before))
    quantity = Fraction(Decimal(sale.sale_increment.amount)) * count
    return _cents(quantity * Fraction(Decimal(sale.applicable_price))
                  / Fraction(Decimal(sale.price_per_quantity.amount)))


def _search(sales: list[NormalizedSale], need: Fraction, limits: SearchLimits,
            reserved_units: dict[str, int]) -> StoreCoverage:
    first = sales[0].raw_source
    identity = dict(retailer=first.retailer, store_id=first.store_id)
    eligible = [sale for sale in sales if sale.eligible_for_calculation]
    if not eligible:
        return StoreCoverage(**identity, status='no_eligible_product')
    if len(eligible) > limits.max_references:
        return StoreCoverage(**identity, status='search_limit')
    sizes, bounds = [], []
    for sale in eligible:
        size = Fraction(Decimal((sale.content_per_package if sale.price_basis == 'package'
                                 else sale.sale_increment).amount))
        minimum = (1 if sale.price_basis == 'package' else
                   _ceil(Fraction(Decimal(sale.minimum_sale.amount)) / size))
        maximum = max(minimum, _ceil(need / size))
        # Au-delà, retirer un pas (ou l'achat minimal entier) garde la
        # couverture et ne peut augmenter le coût : aucun optimum perdu.
        sizes.append(size)
        bounds.append((minimum, maximum))
    # La référence avec le plus de choix sert de complément : pour chaque
    # combinaison des autres, seul son plus petit achat couvrant est utile
    # (tarif non décroissant, puis surplus minimal). Un seul format est ainsi
    # résolu directement, même si des millions de paquets sont nécessaires.
    complement = max(range(len(bounds)), key=lambda i: bounds[i][1] - bounds[i][0])
    enumerated = [i for i in range(len(bounds)) if i != complement]
    option_counts = [bounds[i][1] - bounds[i][0] + 2 for i in enumerated]
    combinations = prod(option_counts)
    if any(n > limits.max_options for n in option_counts) or combinations > limits.max_combinations:
        return StoreCoverage(**identity, status='search_limit', combinations=combinations)
    options = [[0, *range(bounds[i][0], bounds[i][1] + 1)] for i in enumerated]
    # Une seule application de chaque palier et un arrondi par référence,
    # après regroupement. Cache limité aux options réellement consultées.
    costs = [{0: 0} for _ in eligible]

    def cost_at(i, n):
        if n not in costs[i]:
            costs[i][n] = _line_cost(eligible[i], n, reserved_units.get(eligible[i].product_id, 0))
        return costs[i][n]

    best_key, best_counts = None, None
    for partial in product(*options):
        counts = [0] * len(eligible)
        for i, n in zip(enumerated, partial):
            counts[i] = n
        covered = sum((size * n for size, n in zip(sizes, counts)), Fraction())
        if covered < need:
            counts[complement] = max(bounds[complement][0], _ceil((need - covered) / sizes[complement]))
            covered += sizes[complement] * counts[complement]
        used = tuple((sale.product_id, n) for sale, n in zip(eligible, counts) if n)
        key = (sum(cost_at(i, n) for i, n in enumerate(counts)), covered - need, len(used), used)
        if best_key is None or key < best_key:
            best_key, best_counts = key, counts
    assert best_key is not None
    lines = tuple(PurchaseLine(sale=sale, sale_units=n, quantity=_quantity(size * n),
                              amount=_money(cost[n]), estimated_weight=sale.price_basis == 'weight')
                  for sale, size, cost, n in zip(eligible, sizes, costs, best_counts) if n)
    return StoreCoverage(**identity, status='complete', lines=lines,
                         amount=_money(best_key[0]), surplus=_quantity(best_key[1]),
                         combinations=combinations)


def calculate_coverage(ingredient_id: str, quantities: list[ShoppingQuantity],
                       sales: list[NormalizedSale], on_date: date, *,
                       owned: list[ShoppingQuantity] | None = None,
                       purchased: list[ShoppingQuantity] | None = None,
                       reserved_units: dict[str, int] | None = None,
                       limits: SearchLimits = SearchLimits()) -> CoverageResult:
    """Regrouper toutes les contributions d'un ingrédient avant ses paliers.

    L'appelant fournit les besoins de toute la liste, et les couvertures déjà
    enregistrées. Les lignes libres et les besoins multidimensionnels restent
    à vérifier. Les achats passés ne sont ni réévalués ni modifiés ici.
    """
    required = _vector(quantities)
    available = _vector((owned or []) + (purchased or []))
    if reserved_units is not None and any(type(n) is not int or n < 0 for n in reserved_units.values()):
        raise ValueError('Les unités déjà affectées doivent être des entiers positifs ou nuls.')
    base = dict(ingredient_id=ingredient_id, evaluated_on=on_date)
    if not required:
        return CoverageResult(**base, status='unquantified', unit=None, remaining=None)
    if len(required) != 1 or set(available) - set(required):
        return CoverageResult(**base, status='incompatible_units', unit=None, remaining=None)
    unit, requested = next(iter(required.items()))
    need = max(Fraction(), requested - available.get(unit, Fraction()))
    if not need:
        return CoverageResult(**base, status='already_covered', unit=unit, remaining='0')
    groups: dict[tuple[str, str | None], list[NormalizedSale]] = {}
    seen, excluded = set(), []
    for supplied in sales:
        if supplied.ingredient_id != ingredient_id:
            continue
        # Revalider la preuve et la date ; ne pas faire confiance à un booléen
        # d'admissibilité ancien ou à des champs dérivés modifiés par l'appelant.
        sale = normalize_sale(ingredient_id, supplied.raw_source, on_date, supplied.review)
        if sale.product_id in seen:
            raise ValueError('Plusieurs instantanés du même produit : choisir la source courante.')
        seen.add(sale.product_id)
        source = sale.raw_source
        quantity = sale.content_per_package if sale.price_basis == 'package' else sale.price_per_quantity
        issues = list(sale.issues)
        if purchased and sale.quantity_limit is not None and reserved_units is None:
            issues.append('PROMOTION_USAGE_UNKNOWN')
        if quantity is None or quantity.unit != unit:
            issues.append('NEED_DIMENSION_INCOMPATIBLE')
        # Une portée enseigne n'atteste pas la disponibilité dans une succursale.
        # La simulation reste identifiée (enseigne, None), sans mélange de portées.
        if issues:
            excluded.append((sale.product_id, tuple(sorted(set(issues)))))
            sale = sale.model_copy(update={'issues': issues, 'eligible_for_calculation': False})
        groups.setdefault((source.retailer, source.store_id), []).append(sale)
    stores = tuple(_search(sorted(values, key=lambda s: s.product_id), need, limits, reserved_units or {})
                   for _, values in sorted(groups.items(), key=lambda entry: (entry[0][0], entry[0][1] or '')))
    complete = [store for store in stores if store.status == 'complete']
    best = None
    if complete and not any(store.status == 'search_limit' for store in stores):
        best = min(complete, key=lambda s: (Decimal(s.amount), Decimal(s.surplus), len(s.lines),
                   tuple((line.sale.product_id, line.sale_units) for line in s.lines), s.retailer, s.store_id or ''))
    return CoverageResult(**base, status='calculated', unit=unit, remaining=_quantity(need),
                          stores=stores, excluded=tuple(sorted(excluded)), best=best)

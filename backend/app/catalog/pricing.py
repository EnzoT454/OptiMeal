"""Prix exact d'un nombre d'unités vendues, sans supposer les paquets nécessaires."""
from datetime import date
from decimal import Decimal

from backend.app.common.public_data import promotion
from .common_schemas import SourceProduct


def purchase_total(product: SourceProduct, units: int, on_date: date) -> Decimal | None:
    """Appliquer le palier seulement durant la promotion confirmée active.

    Les unités sont des unités de vente entières, pas des portions de recette.
    Sans prix régulier connu, l'après-promotion reste inconnu.
    """
    if type(units) is not int or units < 1:
        raise ValueError('Le nombre d’unités doit être un entier strictement positif.')
    active = promotion(product, on_date).status == 'active' and product.promo_price is not None
    if active:
        discounted = min(units, product.quantity_limit) if product.quantity_limit is not None else units
        total = Decimal(product.promo_price) * discounted
        if discounted < units:
            total += Decimal(product.price_after_limit) * (units - discounted)
        return total
    return None if product.price is None else Decimal(product.price) * units

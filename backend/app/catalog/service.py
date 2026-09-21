"""Recherche catalogue et règles de qualité des prix internes."""
import re
import unicodedata
from collections.abc import Iterable
from typing import Any


# Catégories explicitement non alimentaires de la taxonomie épiceries.ca.
# Elles sont exclues d'une recherche d'ingrédients, sans prétendre classifier
# les catégories inconnues ou « Autres produits ».
NON_FOOD_CATEGORY_IDS = frozenset({65, 66, 67, 68, 69, 70})


def _search_terms(value: str) -> list[str]:
    """Normalise une requête ou un nom afin de comparer des mots entiers."""
    normalized = unicodedata.normalize('NFKD', value)
    without_accents = ''.join(char for char in normalized if not unicodedata.combining(char))
    return re.findall(r'[a-z0-9]+', without_accents.lower())


def _relevance_score(name: str, query: str) -> tuple[int, int, str]:
    """Classe les correspondances textuelles sans inférer la nature d'un produit."""
    terms = _search_terms(query)
    name_terms = _search_terms(name)
    if not terms or not name_terms:
        return (0, 0, name.casefold())

    first_position = min((name_terms.index(term) for term in terms if term in name_terms), default=len(name_terms))
    all_terms_present = all(term in name_terms for term in terms)
    starts_with_query = name_terms[:len(terms)] == terms
    # Un produit dont le nom commence par la requête est en général plus
    # pertinent qu'un produit où le terme apparaît seulement dans une saveur.
    return (int(starts_with_query) * 2 + int(all_terms_present), -first_position, name.casefold())


def filter_and_rank_search_results(results: Iterable[dict[str, Any]], query: str | None,
                                   food_only: bool, category_requested: bool,
                                   rank_by_relevance: bool = True) -> tuple[list[dict[str, Any]], int]:
    """Retire les catégories non alimentaires et classe les noms les plus directs.

    Un filtre explicite ``category`` est prioritaire : il permet notamment de
    consulter volontairement une catégorie non alimentaire.
    """
    candidates = list(results)
    if food_only and not category_requested:
        filtered = [item for item in candidates if item.get('category') not in NON_FOOD_CATEGORY_IDS]
    else:
        filtered = candidates
    excluded_count = len(candidates) - len(filtered)
    if query and rank_by_relevance:
        filtered.sort(key=lambda item: _relevance_score(str(item.get('name', '')), query), reverse=True)
    return filtered, excluded_count

"""Suggestions explicables ; aucune confiance arbitraire ni approbation automatique."""
import re
import unicodedata

from .schemas import Ingredient


def search_text(text: str) -> str:
    text = ''.join(c for c in unicodedata.normalize('NFKD', text.casefold())
                   if not unicodedata.combining(c))
    # Préserver les nombres : lait 2 % et 3,25 % restent distincts.
    return ' '.join(re.findall(r'\d+(?:[.,]\d+)?|[a-z]+|%', text))


def contains(text: str, term: str) -> bool:
    return f' {search_text(term)} ' in f' {search_text(text)} '


def match_name(ingredient: Ingredient, name: str) -> tuple[str, list[str]]:
    aliases = [alias for alias in ingredient.aliases if contains(name, alias)]
    if not aliases:
        return 'rejected', ['no_alias_match']
    excluded = [term for term in ingredient.excluded_terms if contains(name, term)]
    if excluded:
        return 'rejected', ['excluded_term:' + term for term in excluded]
    if ingredient.required_any and not any(contains(name, term) for term in ingredient.required_any):
        return 'rejected', ['required_attribute_missing']
    return 'suggested', ['alias:' + aliases[0], 'manual_approval_required']

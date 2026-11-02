"""Calculs de notation sans accès réseau, stockage ni arrondi d'affichage.

Les services fournissent les effectifs et sommes des évaluations admissibles
après contrôle d'accès. Les agrégats permettent un calcul SQL groupé sans
charger chaque vote en Python. Les services filtrent la version de contenu ;
ce module ne détermine pas l'admissibilité des votes.
"""
from dataclasses import dataclass
from decimal import Decimal, localcontext

TASTE_WEIGHT = Decimal('0.40')
RELIABILITY_WEIGHT = Decimal('0.40')
EASE_WEIGHT = Decimal('0.20')
DEFAULT_REFERENCE_AVERAGE = Decimal('4.0')
DEFAULT_PRIOR_WEIGHT = 20


@dataclass(frozen=True)
class RatingSummary:
    count: int
    average: Decimal | None
    taste: Decimal | None
    reliability: Decimal | None
    ease: Decimal | None
    ranking_score: Decimal | None


def validate_count(count: int) -> None:
    if type(count) is not int or count < 0:
        raise ValueError('Le nombre d’évaluations doit être un entier positif ou nul.')


def valid_average(value: Decimal) -> bool:
    return isinstance(value, Decimal) and value.is_finite() and Decimal(1) <= value <= Decimal(5)


def ranking_score(average: Decimal | None, count: int, *,
                  reference_average: Decimal = DEFAULT_REFERENCE_AVERAGE,
                  prior_weight: int = DEFAULT_PRIOR_WEIGHT) -> Decimal | None:
    """Score interne de tri ; une recette sans vote reste sans score.

    C et m sont des paramètres serveur, indépendants des notes du mobile.
    Aucun seuil minimal de votes n'est imposé pour recevoir un score.
    """
    validate_count(count)
    if not valid_average(reference_average):
        raise ValueError('La moyenne de référence doit être un Decimal fini entre 1 et 5.')
    if type(prior_weight) is not int or prior_weight <= 0:
        raise ValueError('Le poids de référence doit être un entier strictement positif.')
    if count == 0:
        if average is not None:
            raise ValueError('Sans évaluation, la moyenne doit être absente.')
        return None
    if not valid_average(average):
        raise ValueError('Une recette évaluée doit avoir une moyenne Decimal finie entre 1 et 5.')
    with localcontext() as context:
        context.prec = 28
        return (count * average + prior_weight * reference_average) / (count + prior_weight)


def summarize_ratings(*, count: int, taste_total: int, reliability_total: int, ease_total: int,
                      reference_average: Decimal = DEFAULT_REFERENCE_AVERAGE,
                      prior_weight: int = DEFAULT_PRIOR_WEIGHT) -> RatingSummary:
    """Moyennes réelles et score ajusté à partir de trois sommes entières.

    Avec zéro vote, le service doit convertir les SUM SQL nulles en zéro.
    Toute incohérence est refusée plutôt que remplacée par une note inventée.
    """
    validate_count(count)
    for total in (taste_total, reliability_total, ease_total):
        if type(total) is not int or not count <= total <= 5 * count:
            raise ValueError('Les sommes des critères sont incompatibles avec le nombre d’évaluations.')
    if count == 0:
        score = ranking_score(None, count, reference_average=reference_average, prior_weight=prior_weight)
        return RatingSummary(count=0, average=None, taste=None, reliability=None, ease=None, ranking_score=score)
    with localcontext() as context:
        context.prec = 28
        # Pondérer les sommes avant division évite de réutiliser des moyennes
        # par critère arrondies, notamment lors de divisions périodiques.
        average = (TASTE_WEIGHT * taste_total + RELIABILITY_WEIGHT * reliability_total
                   + EASE_WEIGHT * ease_total) / count
        return RatingSummary(
            count=count, average=average,
            taste=Decimal(taste_total) / count,
            reliability=Decimal(reliability_total) / count,
            ease=Decimal(ease_total) / count,
            ranking_score=ranking_score(average, count, reference_average=reference_average,
                                        prior_weight=prior_weight),
        )

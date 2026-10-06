"""Identifiants stables et rapports communs aux imports du catalogue."""
import hashlib

from .schemas import CatalogExport


def identifier(prefix: str, *parts: str) -> str:
    return prefix + hashlib.sha256('\0'.join(parts).encode()).hexdigest()[:20]


def report(catalog: CatalogExport) -> str:
    names = {i.id: i.name for i in catalog.ingredients}
    lines = [f'# Catalogue — {len(catalog.ingredients)} ingrédients', '',
             f"Succursale cible : **{catalog.target_store['name']}**.", '',
             f'Données : `{catalog.dataset_kind}` ; évaluation : {catalog.evaluated_at.isoformat()}.', '',
             '**Les prix restent à vérifier. Une succursale déclarée par une source ne prouve pas le prix en caisse.**', '',
             '| Ingrédient | Produits candidats | Prix relevés | Prix vérifiés en succursale |',
             '| --- | ---: | ---: | ---: |']
    lines.extend(f'| {names[c.ingredient_id]} | {c.candidate_count} | {c.offer_count} | 0 |' for c in catalog.coverage)
    lines += ['', '## Collecte', '',
              f"- Stratégie : {catalog.collection['strategy']}.",
              f"- Captures : {catalog.collection['capture_count']}.",
              f"- Erreurs : {len(catalog.collection['errors'])}.",
              f"- Limites de collecte atteintes : {len(catalog.collection['truncations'])}.", '',
              'Consulter `catalog.json` pour les formats, dates, sources et avertissements, '
              '`review.json` pour les rapprochements à vérifier et `raw.json` pour rejouer.', '',
              'Une référence absente signifie « non trouvée dans cet échantillon », jamais « produit non vendu ». '
              'Aucune donnée n’est approuvée ni insérée dans PostgreSQL par cette commande.', '']
    if catalog.collection.get('searches'):
        lines += ['## Répartition par recherche', '',
                  '| Ingrédient | Requête | Lignes reçues | Quota | Téléchargement achevé |',
                  '| --- | --- | ---: | ---: | --- |']
        for search in catalog.collection['searches']:
            lines.append(f"| {names.get(search['ingredient_id'], search['ingredient_id'])} | {search['query']} | {search['row_count']} | {search['limit']} | {search['complete']} |")
        lines += ['', 'Un téléchargement achevé ne garantit ni exhaustivité ni correspondance avec l’ingrédient.', '']
    elif catalog.collection.get('rows_by_query'):
        lines += ['## Requêtes présentes dans la capture', '']
        lines.extend(f'- {query} : {count} lignes.' for query, count in catalog.collection['rows_by_query'].items())
        lines += ['', 'Requêtes demandées : ' + ', '.join(catalog.collection['requested_queries']) + '.', '']
    return '\n'.join(lines)

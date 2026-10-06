# Catalogue Maxi

Le catalogue utilise **Apify pour Maxi**. La cible actuelle est Maxi Montréal Côte-des-Neiges, avec l’identifiant fournisseur `8661`. L’extraction web par modèle IA est retenue pour Metro et Super C ; ces connecteurs restent à développer. Épiceries.ca n’est plus une source du projet.

**Validation consignée le 4 octobre 2026 :** Hamza confirme que les produits, les prix et la succursale des données Maxi récupérées avec Apify ont été vérifiés et sont corrects. Le [guide Apify](APIFY.md#validation-humaine-des-données-maxi--4-octobre-2026) conserve ce point de validation.

## Configuration

Les fichiers de `backend/config/catalog/` définissent 31 ingrédients en trois lots :

- `ingredients.json` et `apify_queries.json` : les dix premiers ingrédients.
- `batch2/` : dix ingrédients supplémentaires.
- `batch3/` : les onze derniers.
- `target_store.json` : succursale cible et provenance de son identifiant.
- `apify_food_categories.json` : rayons utilisés pour les promotions alimentaires.

Les alias, exclusions et formats servent à proposer des correspondances. Ils ne constituent pas une validation automatique des produits.

## Collecte et rejeu

Après avoir exporté `APIFY_TOKEN`, depuis la racine :

```bash
python -m backend.cli.ingest_catalog --live --location-id 8661 \
  --max-items 100 --max-charge-usd 1 --output-dir data/catalog/maxi/nouvelle-collecte

python -m backend.cli.ingest_catalog --replay data/catalog/maxi/nouvelle-collecte/raw.json \
  --output-dir data/catalog/maxi/rejeu
```

Le dossier de sortie doit être nouveau. Le rejeu fonctionne sans réseau ni token. Les détails des lots, promotions, plafonds et reprises figurent dans [APIFY.md](APIFY.md). L’option `--source apify` reste acceptée ; Apify est désormais la source par défaut.

Le [guide des données locales](DATA.md) décrit aussi les collectes existantes et les anciens essais archivés.

Chaque collecte produit :

```text
data/catalog/maxi/<collecte>/
├── raw.json         # Configuration, runs et réponses sources
├── catalog.json     # Produits, offres, correspondances et couverture
├── review.json      # Suggestions et rejets à relire
└── report.md        # Bilan de collecte
```

Les captures sont conservées dans `data/`, qui peut désormais être ajouté à Git. Aucune insertion PostgreSQL ni confirmation utilisateur n’est réalisée par cette commande.

## Contrat et limites

Le contrat Pydantic `catalog-pilot-1.0` conserve ingrédients, produits, formats, prix, sources, dates et couverture. Les montants sont des décimaux exacts, sérialisés en chaînes. Un champ inconnu reste inconnu ; le poids estimé d’un produit vendu au poids ne devient pas un paquet fixe.

Les indicateurs des exports historiques décrivent l’état de l’extraction avant confirmation humaine. Les offres portent `review_required: true`, `eligible_for_optimizer: false` et un `store_id` interne nul. La localisation déclarée par Apify est conservée séparément et ne confirme pas le prix en caisse. Une période promotionnelle absente n’est pas inventée.

Les fichiers finaux `data/catalog/maxi/data_final/produits.json` et `promos.json` utilisent le même format que Super C. La confirmation de Hamza couvre les produits, prix et la succursale des données retenues ; elle reste documentée et conservée avec les anciens attributs de validation dans `data/catalog/maxi/archives/data_final-before-common-format/`. Elle ne s’applique pas automatiquement aux nouvelles collectes et ne rend pas les offres automatiquement éligibles à l’optimiseur.

Les quotas bornent les recherches : le résultat ne représente pas l’inventaire complet de Maxi. Le rapport distingue candidats trouvés, prix relevés et prix vérifiés en succursale.

Pour servir une collecte, définir `CATALOG_IMPORT_PATH` puis démarrer FastAPI. `GET /catalog` lit l’export complet et `GET /catalog/offers` permet un filtre par ingrédient et une pagination. Ces routes ne déclenchent aucune collecte.

Le [modèle PostgreSQL](DATABASE.md) reste une proposition. La fusion des collectes, la confirmation persistée des correspondances et les estimations restent à implémenter.

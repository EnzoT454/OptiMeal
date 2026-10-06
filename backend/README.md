# Backend OptiMeal

Le backend contient l’API FastAPI, la collecte Apify pour Maxi et l’extraction locale des reçus. Le code est organisé par fonction, avec des commandes et des guides séparés.

## Structure

```text
backend/
├── README.md
├── .env.example                 # Variables actuelles et emplacements des futurs secrets
├── app/                         # Code de l’API et traitements réutilisables
│   ├── main.py                  # FastAPI, chargement du catalogue et /health
│   ├── config.py                # Configuration et futurs paramètres PostgreSQL/auth
│   ├── database.py              # Squelette du point d’accès PostgreSQL
│   ├── security.py              # Squelette de l’authentification
│   ├── accounts/                # Base des comptes : router, schemas, models, service
│   ├── recipes/                 # Base des recettes, ingrédients et favoris
│   ├── planning/                # Base des plans hebdomadaires et de leur historique
│   ├── shopping_lists/          # Base des listes, modifications et recalcul
│   ├── common/                  # Base des utilitaires partagés : prix et unités
│   ├── catalog/
│   │   ├── router.py            # GET /catalog et /catalog/offers
│   │   ├── schemas.py           # Contrat Pydantic du catalogue
│   │   ├── models.py            # Futurs modèles produits, magasins et prix
│   │   ├── service.py           # Futures règles du catalogue persisté
│   │   ├── formats.py           # Formats, unités et codes-barres
│   │   ├── matching.py          # Correspondances ingrédient-produit
│   │   ├── export.py            # Identifiants stables et rapport de collecte
│   │   ├── apify_command.py     # Préparation des collectes, reprises et rejeux
│   │   ├── apify_batch.py       # Répartition des recherches, quotas et budgets
│   │   └── apify_ingestion.py   # Capture et normalisation des réponses
│   ├── price_sources/
│   │   └── apify_loblaws.py     # Client HTTP Apify
│   └── receipts/
│       ├── ocr.py               # Apple Vision et Tesseract + OpenCV
│       ├── vision_ocr.swift     # Reconnaissance de texte sur Mac
│       ├── parser.py            # Reconstruction des articles et montants
│       ├── schemas.py           # Contrat JSON des reçus
│       ├── validation.py        # Contrôles des montants
│       └── rules/               # Règles communes, Maxi, Metro et génériques
├── cli/                         # Commandes exécutées avec python -m
│   ├── ingest_catalog.py        # Collecte, reprise et rejeu Apify
│   └── extract_receipt.py       # Extraction OCR et export du schéma JSON
├── config/catalog/              # 31 ingrédients, requêtes, rayons et succursale
├── docs/
│   ├── APIFY.md                 # Installation et utilisation d’Apify
│   ├── CATALOG.md               # Contrat et limites du catalogue
│   ├── RECEIPTS.md              # Installation OCR, essais et limites
│   ├── DATA.md                  # Organisation des données locales
│   ├── DATABASE.md              # Proposition PostgreSQL pour la suite
│   └── examples/                # Exemple de catalogue fictif
├── alembic/                     # Base des futures migrations PostgreSQL
│   ├── env.py                   # Configuration à compléter
│   └── versions/               # Emplacement des migrations
├── tests/
│   ├── conftest.py              # Base des futures fixtures partagées
│   ├── test_accounts.py         # Emplacement des tests comptes
│   ├── test_recipes.py          # Emplacement des tests recettes
│   ├── test_planning.py         # Emplacement des tests plans
│   ├── test_shopping_lists.py   # Emplacement des tests listes
│   ├── test_catalog.py          # Formats, codes-barres et correspondances
│   ├── test_apify_catalog.py    # Collecte, erreurs, reprise, rejeu et API
│   └── test_receipts.py         # OCR, parsing et contrôles des montants
└── postman/                     # Requêtes pour essayer l’API
```

Les fichiers `__init__.py` identifient les packages Python. Les squelettes des composantes retenues sont conservés comme base du développement à venir. Ils précisent les responsabilités sans prétendre que les fonctionnalités sont déjà réalisées. Dans chaque domaine, `router.py` recevra les requêtes HTTP, `schemas.py` définira les contrats, `models.py` les modèles persistants et `service.py` les règles métier.

## Lancer l’API

Depuis la racine du projet, avec l’environnement Python activé :

```bash
python -m pip install -r requirements.txt
export CATALOG_IMPORT_PATH=data/catalog/maxi/maxi-apify-batch2-01/catalog.json
python -m uvicorn backend.app.main:app --reload --port 8001
```

Choisir une collecte existante. Sans catalogue configuré, `GET /health` fonctionne et les routes `/catalog` et `/catalog/offers` renvoient 503. La documentation interactive est à `http://localhost:8001/docs`. Un fichier invalide empêche le démarrage.

Les fichiers `data_final/produits.json` et `promos.json` servent à consulter les données regroupées ; l’API charge actuellement un export `catalog-pilot-1.0`, comme ceux des collectes. Les lectures HTTP ne lancent aucun appel Apify.

## Collecter les données Maxi

Exporter `APIFY_TOKEN` dans le terminal avant une collecte réelle. Les commandes ne chargent pas automatiquement `.env`.

```bash
python -m backend.cli.ingest_catalog --live --location-id 8661 \
  --max-items 100 --max-charge-usd 1 \
  --output-dir data/catalog/maxi/nouvelle-collecte
```

Le rejeu fonctionne sans token ni réseau :

```bash
python -m backend.cli.ingest_catalog \
  --replay data/catalog/maxi/maxi-apify-02/raw.json \
  --output-dir data/catalog/maxi/nouveau-rejeu
```

Consulter [Apify](docs/APIFY.md) pour les lots, promotions, budgets et reprises, et le [guide catalogue](docs/CATALOG.md) pour le contrat. Hamza a vérifié les données Maxi récupérées : les produits, les prix et la succursale sont corrects. Cette validation humaine est consignée dans le [guide Apify](docs/APIFY.md#validation-humaine-des-données-maxi--4-octobre-2026).

## Extraire un reçu

```bash
python -m backend.cli.extract_receipt data/receipts/images/recu_maxi.jpg \
  --engine tesseract --output data/receipts/extractions/nouveau-recu.json
```

Sur Mac, `--engine vision` utilise Apple Vision. Pour Windows, utiliser Tesseract + OpenCV. Le [guide OCR](docs/RECEIPTS.md) explique l’installation, le modèle complémentaire Metro et les résultats. Le chemin Windows reste à tester sur PC.

Les reçus restent locaux et privés. La confirmation humaine du 4 octobre porte sur les prix de l’échantillon Maxi/Metro ; les anciennes sorties peuvent conserver des erreurs. Le parcours de correction et confirmation en base reste à développer.

## Tests et développement

```bash
python -m pytest backend/tests -q
```

Les tests couvrent les modules existants sans collecte externe ni appel payant. Ils ne prouvent pas l’exactitude des prix en magasin.

Pour la suite, ajouter les connecteurs web IA Metro/Super C dans `app/price_sources/`, puis construire PostgreSQL, comptes, recettes, planning et listes progressivement. Compléter les fichiers déjà préparés dans les domaines concernés et leurs tests. Garder les routes HTTP courtes et les traitements réutilisables hors des commandes.

Le [guide des données](docs/DATA.md) décrit les fichiers locaux. Le [modèle de base](docs/DATABASE.md) reste une proposition à concrétiser lors de l’intégration PostgreSQL.

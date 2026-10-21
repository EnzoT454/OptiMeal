# Backend OptiMeal

Le backend contient l’API FastAPI, la collecte Apify pour Maxi et l’extraction locale des reçus. Le code est organisé par fonction, avec des commandes et des guides séparés.

## Structure

```text
backend/
├── README.md
├── .env.example                 # Variables actuelles et emplacements des futurs secrets
├── app/                         # Code de l’API et traitements réutilisables
│   ├── main.py                  # FastAPI, catalogues, /health et /health/db
│   ├── config.py                # Configuration par application, .env et environnement
│   ├── database.py              # Moteur PostgreSQL et sessions par requête
│   ├── security.py              # Validation distante Supabase Auth
│   ├── accounts/                # Identité Auth et profil minimal
│   ├── recipes/                 # Modèles, autorisations, CRUD manuel et favoris
│   ├── planning/                # Base des plans hebdomadaires et de leur historique
│   ├── shopping_lists/          # Base des listes, modifications et recalcul
│   ├── common/                  # Contrats et routes communs ; calculs à développer
│   ├── catalog/
│   │   ├── router.py            # GET /catalog et /catalog/offers
│   │   ├── schemas.py           # Contrat Pydantic du catalogue
│   │   ├── models.py            # Modèle SQL Ingredient ; autres tables à venir
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
│   ├── build_common_catalog.py  # Référentiel commun des trois enseignes
│   ├── export_shared_contracts.py # Schémas et exemples v1
│   ├── import_ingredients.py    # Import PostgreSQL du référentiel
│   ├── import_recipes.py        # Import rejouable sans remplacement
│   ├── ingest_catalog.py        # Collecte, reprise et rejeu Apify
│   └── extract_receipt.py       # Extraction OCR et export du schéma JSON
├── config/catalog/              # 31 ingrédients, requêtes, rayons et succursale
├── docs/
│   ├── APIFY.md                 # Installation et utilisation d’Apify
│   ├── CATALOG.md               # Contrat et limites du catalogue
│   ├── RECEIPTS.md              # Installation OCR, essais et limites
│   ├── DATA.md                  # Organisation des données locales
│   ├── DATABASE.md              # État et modèle étendu de la base
│   ├── CONTRACTS.md             # Contrats publics v1
│   ├── SUPABASE.md              # Connexion serveur
│   ├── AUTH.md                  # Comptes, autorisations et vérification
│   ├── MIGRATIONS.md            # Migrations et imports
│   └── examples/                # Exemple de catalogue fictif
├── alembic.ini                  # Configuration sans identifiants
├── alembic/                     # Chaîne unique des migrations PostgreSQL
│   ├── env.py                   # Métadonnées applicatives et connexion serveur
│   └── versions/                # ingredient, puis recipe et recipe_ingredient
├── tests/
│   ├── conftest.py              # Base des futures fixtures partagées
│   ├── test_accounts.py         # Emplacement des tests comptes
│   ├── test_recipes.py          # Contraintes des tables recettes
│   ├── test_recipe_import.py    # Import et conflits
│   ├── test_recipe_api.py       # Lectures HTTP PostgreSQL
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

## Contrats communs Recettes et Promos

Le serveur expose aussi `/api/v1/ingredients`, `/api/v1/recipes`,
`/api/v1/recipes/{id}`, `/api/v1/offers` et `/api/v1/offers/{id}`. Ces routes
lisent les ingrédients et offres dans le catalogue JSON commun. Les routes
Recettes lisent PostgreSQL via `DATABASE_URL`, après migration et import.
Elles ont les mêmes enveloppes de pagination et d’erreur,
des identifiants partagés et des prix décimaux en chaînes.

Le [guide des contrats](docs/CONTRACTS.md) détaille les filtres, dates et limites.
Les [schémas et exemples](contracts/v1/README.md) peuvent être régénérés avec
`python -m backend.cli.export_shared_contracts`. La connexion PostgreSQL/Supabase
est disponible, avec les tables `ingredient`, `recipe` et `recipe_ingredient`,
et les imports rejouables des ingrédients et recettes. Les autres tables,
le raccordement des offres et les parcours planning/listes restent à intégrer.
Supabase Auth, les profils et les recettes personnelles sont disponibles ;
voir le [guide Auth](docs/AUTH.md) et le [mobile](../mobile/README.md).

## Connexion PostgreSQL / Supabase

Le serveur lit `backend/.env` au démarrage, avec priorité aux variables
exportées. `DATABASE_URL` est optionnelle : sans URL valide, `/health/db`
retourne 503 et les routes JSON restent disponibles. Avec une base accessible,
ce contrôle exécute `SELECT 1` et retourne `database: reachable`.

Le [guide de connexion](docs/SUPABASE.md) décrit les paramètres, le cycle des
sessions et les vérifications. Aucun schéma applicatif n’est créé au démarrage ;
Alembic gère les modifications du schéma :

```bash
python -m alembic -c backend/alembic.ini upgrade head
python -m backend.cli.import_ingredients
python -m backend.cli.import_recipes
```

Le [guide des migrations](docs/MIGRATIONS.md) décrit le schéma, le rejeu sans
doublons et la création des prochaines tables à deux. Les tests PostgreSQL
utilisent une base locale jetable ; la CI en fournit une automatiquement.

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

Pour la suite, ajouter les connecteurs web IA Metro/Super C dans `app/price_sources/`, puis compléter les tables produits/offres, les comptes, les écritures de recettes, le planning et les listes progressivement. Compléter les fichiers déjà préparés dans les domaines concernés et leurs tests. Garder les routes HTTP courtes et les traitements réutilisables hors des commandes.

Le [guide des données](docs/DATA.md) décrit les fichiers locaux. Le [modèle de base](docs/DATABASE.md) reste une proposition à concrétiser lors de l’intégration PostgreSQL.

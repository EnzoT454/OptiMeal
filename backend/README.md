# Backend OptiMeal

Le backend contient l’API FastAPI, la collecte Apify pour Maxi et l’extraction locale des reçus. Le code est organisé par fonction, avec des commandes et des guides séparés.

Le backend prépare désormais Découvrir, Mes recettes et Favoris : recettes
privées par défaut, publication volontaire et retrait par le propriétaire.
Appliquer les migrations jusqu’à la tête courante `0010_preserve_meals` avant
de démarrer cette version : `0009_recipe_visibility` ajoute le partage et
`0010_preserve_meals` conserve les repas après suppression de leur recette. Les
[contrats](docs/CONTRACTS.md#visibilité-et-sections-de-recettes--étape-backend)
décrivent `scope` et `PATCH /api/v1/recipes/{id}/visibility`, ainsi que le
masquage des favoris et du calendrier après retrait. Les sections mobiles et le choix de publication dans le formulaire et le
détail sont intégrés ; leurs nouveaux parcours restent à vérifier sur appareil. Le bucket public `recipes-images` est conservé pendant le
prototype ; sa séparation privé/public est reportée après le prototype.

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
│   ├── accounts/                # Identité, profil et suppression de compte (Auth/Storage)
│   ├── recipes/                 # Modèles, autorisations, CRUD manuel et favoris
│   ├── planning/                # Calendrier privé et repas planifiés ; instantanés à développer
│   ├── shopping_lists/          # Base des listes, modifications et recalcul
│   ├── common/                  # Contrats et routes communs ; calculs à développer
│   ├── catalog/
│   │   ├── router.py            # GET /catalog et /catalog/offers
│   │   ├── schemas.py           # Contrat Pydantic du catalogue
│   │   ├── models.py            # Modèles SQL Ingredient, Category, ProductOffer, Circular
│   │   ├── offer_import.py      # Import des catégories et offres (page Promos)
│   │   ├── circulars.py         # Circulaires : PDF → images, Storage, lecture
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
│   ├── import_offers.py         # Import PostgreSQL des catégories et offres
│   ├── import_circulars.py      # Circulaire PDF d'un magasin vers Storage
│   ├── import_recipes.py        # Import rejouable sans remplacement
│   ├── configure_recipe_images.py # Limites et politiques du bucket Storage
│   ├── ingest_catalog.py        # Collecte, reprise et rejeu Apify
│   └── extract_receipt.py       # Extraction OCR et export du schéma JSON
├── config/catalog/              # 31 ingrédients, requêtes, rayons et succursale
├── config/storage/              # Configuration du bucket public recipes-images
├── docs/
│   ├── APIFY.md                 # Installation et utilisation d’Apify
│   ├── CATALOG.md               # Contrat et limites du catalogue
│   ├── RECEIPTS.md              # Installation OCR, essais et limites
│   ├── DATA.md                  # Organisation des données locales
│   ├── DATABASE.md              # État et modèle étendu de la base
│   ├── CONTRACTS.md             # Contrats publics v1
│   ├── SUPABASE.md              # Connexion serveur
│   ├── AUTH.md                  # Comptes, autorisations et vérification
│   ├── RECIPE_IMAGES.md         # Photos de recettes, droits Storage et essais
│   ├── MIGRATIONS.md            # Migrations et imports
│   └── examples/                # Exemple de catalogue fictif
├── alembic.ini                  # Configuration sans identifiants
├── alembic/                     # Chaîne unique des migrations PostgreSQL
│   ├── env.py                   # Métadonnées applicatives et connexion serveur
│   └── versions/                # Huit migrations : comptes, recettes, catalogue, circulaires, photos et calendrier
├── tests/
│   ├── conftest.py              # Base des futures fixtures partagées
│   ├── test_accounts.py         # Profils et isolation des comptes
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

Les fichiers `__init__.py` identifient les packages Python. Les comptes,
recettes, calendrier et contrôles de sécurité sont fonctionnels ; les listes
restent des squelettes et les instantanés historiques sont à développer. Dans chaque domaine, `router.py` traite les requêtes
HTTP, `schemas.py` définit les contrats, `models.py` les modèles persistants
et `service.py` les règles métier, selon l’état d’avancement du domaine.

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
`/api/v1/recipes/{id}`, `/api/v1/offers`, `/api/v1/offers/{id}` et
`/api/v1/circulars`. Les ingrédients sont lus dans le catalogue JSON commun ;
les offres aussi, ou dans PostgreSQL avec `OFFERS_SOURCE=database` dans
`backend/.env` (sans repli silencieux : 503 si la base est indisponible). Les routes
Recettes lisent PostgreSQL via `DATABASE_URL`, après migration et import.
Elles ont les mêmes enveloppes de pagination et d’erreur,
des identifiants partagés et des prix décimaux en chaînes.

Le [guide des contrats](docs/CONTRACTS.md) détaille les filtres, dates et limites.
Les [schémas et exemples](contracts/v1/README.md) peuvent être régénérés avec
`python -m backend.cli.export_shared_contracts`. La connexion PostgreSQL/Supabase
est disponible avec dix migrations couvrant ingrédients, recettes, profils,
favoris, catégories, offres, circulaires, photos de produits, repas planifiés,
visibilité des recettes et conservation des repas après suppression de leur recette. La révision
`0007_product_images` ajoute les champs facultatifs `image_url` et
`image_source` dans `product_offer`. Appliquer `upgrade head`, reconstruire
le catalogue commun et relancer `import_offers` pour remplir ces champs.
La liste et le détail des offres les exposent avec les deux sources de lecture.
Les images sont téléchargées directement depuis les serveurs des magasins ;
elles ne sont pas hébergées dans Storage. Voir les [contrats](docs/CONTRACTS.md#photos-des-produits)
et les [migrations](docs/MIGRATIONS.md#photos-des-produits). Les imports des ingrédients,
recettes et offres sont rejouables. Le calendrier est disponible ; les listes
et l’historique stable par instantanés restent à développer.
Supabase Auth, les profils et les recettes personnelles sont disponibles ;
voir le [guide Auth](docs/AUTH.md) et le [mobile](../mobile/README.md).

## Calendrier des repas

Le calendrier expose `/api/v1/plans` et ses entrées de repas, avec connexion
requise et contrôle du propriétaire. Appliquer `0008_meal_plan` avant de
l’utiliser. Le mobile propose la navigation par semaine, ajout par recette
ou note, portions, déplacement, duplication et restes. Voir le
[guide du calendrier](docs/PLANNING.md) pour les formats et les limites : les
recettes sont encore lues dans leur version courante, sans instantanés.

## Suppression du compte utilisateur

`DELETE /api/v1/me`, avec une session valide et
`{"confirmation":"SUPPRIMER"}`, supprime le compte connecté. Configurer
`SUPABASE_SECRET_KEY` uniquement côté serveur ; les photos du dossier personnel
sont retirées avant la suppression Auth et les cascades des données métier.
Le mobile expose ce parcours dans Paramètres. Voir le
[guide Auth](docs/AUTH.md#suppression-définitive-du-compte) pour les erreurs,
les limites en cas d’interruption et les essais sur compte de test.

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
python -m backend.cli.import_offers
```

Le [guide des migrations](docs/MIGRATIONS.md) décrit le schéma, le rejeu sans
doublons et la création des prochaines tables à deux. Les tests PostgreSQL
utilisent une base locale jetable ; la CI en fournit une automatiquement.

## Images des recettes

Pour les images de recettes, voir [le guide Storage](docs/RECIPE_IMAGES.md).
Le champ `recipe.image_url` conserve l’URL ; les fichiers sont hébergés dans
le bucket public `recipes-images`. Les photos personnelles sont envoyées
depuis la galerie avec des droits d’écriture par propriétaire. Le schéma
applicatif reste géré par les migrations Alembic.

## Promos et circulaires de la semaine

Les offres (prix de base `Prix`, prix promo `PrixPromo`, dates de promotion et
`DateRecuperation`) viennent des fichiers `produits.json` de chaque magasin. Les
circulaires (PDF des magasins) sont découpées en images JPEG et envoyées dans le
bucket Storage public `circulars` ; la table `circular` garde une ligne par magasin.

Prérequis : bucket public `circulars` créé dans Supabase (images JPEG, 5 Mo
maximum) et `SUPABASE_SECRET_KEY` dans `backend/.env`. Cette clé ne va jamais
dans le mobile ni dans Git.

Chaque jeudi (semaine du jeudi au mercredi) :

1. Télécharger les PDF du Québec dans `data/circulars/` : `maxi.pdf`, `metro.pdf`,
   `superc.pdf` (dossier ignoré par Git ; pour Maxi : Imprimer → Enregistrer en PDF).
2. Envoyer les circulaires :
   ```bash
   python -m backend.cli.import_circulars --retailer maxi
   python -m backend.cli.import_circulars --retailer metro
   python -m backend.cli.import_circulars --retailer superc
   ```
   Sans dates : du jeudi au mercredi. Sinon : `--from AAAA-MM-JJ --to AAAA-MM-JJ`.
   L'ancienne circulaire du magasin est remplacée et ses images supprimées.
3. Mettre à jour dans les `produits.json` les produits retrouvés à l'identique dans
   les circulaires (même produit, même format), puis :
   ```bash
   python -m backend.cli.build_common_catalog
   python -m backend.cli.import_offers
   ```
4. Vérifier `GET /api/v1/offers?promotion_only=true` et `GET /api/v1/circulars`.

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

Le 1er novembre, Hamza a aussi confirmé sur iOS le mode visiteur, la connexion
à la demande, la photo obligatoire à la création, les photos des produits et
la suppression du compte. Ces ajouts restent à reproduire sur Android ; les
scénarios d’erreur détaillés restent à compléter.

Les parcours comptes, recettes, photos et Promos ont été confirmés sur iOS
et Android par Hamza le 27 octobre 2026, avec des essais Android par son
coéquipier. Pour la suite, développer les connecteurs web IA Metro/Super C
dans `app/price_sources/`, les modes IA des recettes, les instantanés du calendrier, les listes,
l’historique des prix et les contributions par reçus. Compléter les fichiers déjà préparés dans les domaines concernés et leurs tests. Garder les routes HTTP courtes et les traitements réutilisables hors des commandes.

Le [guide des données](docs/DATA.md) décrit les fichiers locaux. Le [guide de la base](docs/DATABASE.md) distingue les tables actuelles du modèle étendu proposé pour l’historique, les reçus et les estimations.

*Dernière mise à jour : 1er novembre 2026*

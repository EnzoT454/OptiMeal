<h1 align="center">OptiMeal</h1>

<p align="center">
  Planifier ses repas et préparer sa liste d’épicerie selon son budget.
</p>

Nous développons OptiMeal dans le cadre du cours IFT3150 à l’Université de Montréal. L’idée est de réunir les recettes, les repas de la semaine et les prix des épiceries au même endroit pour faciliter la préparation des courses.

L’application permettra de choisir ses recettes et ses portions, puis de préparer une liste d’achats par magasin en tenant compte du budget et des déplacements. Trois modes d’ajout sont prévus : ajouter une recette manuellement, trouver une idée et cuisiner avec ce qu’on a déjà. L’ajout manuel donnera le choix entre remplir un formulaire et saisir un texte que l’IA transformera dans le même format de recette, à vérifier avant de l’enregistrer.

Lorsque les prix précis manquent, nous afficherons une fourchette estimée min–max, en signalant les articles dont le prix reste impossible à estimer. À la fin des courses, l’utilisateur pourra aussi photographier son reçu et confirmer les prix extraits pour contribuer aux estimations. Cette contribution sera facultative.

## Technologies

- **Mobile :**  React Native · TypeScript · Expo , pour iOS et Android
- **Backend :** Python · FastAPI
- **Données :** PostgreSQL et Supabase Storage pour les images de recettes
- **Documentation :** Zensical · GitHub Pages

## Statut actuel

Éléments réalisés :

- Site de suivi et documentation du projet.
- API FastAPI permettant de consulter le catalogue.
- Contrats communs Recettes et Promos, avec API de lecture du catalogue partagé et des 10 recettes initiales.
- Connexion PostgreSQL/Supabase optionnelle, contrôle `/health/db`, migrations des ingrédients et recettes, imports rejouables des 31 ingrédients et 10 recettes ; les recettes HTTP lisent PostgreSQL, les ingrédients et offres restent sur JSON.
- Supabase Auth, profil minimal et recettes personnelles : création manuelle, édition, suppression et favoris avec contrôles de propriétaire.
- Socle mobile : inscription avec confirmation du courriel, connexion, session persistante, profil et parcours Recettes, essayés sur iPhone avec deux comptes.
- Images des dix recettes initiales hébergées dans Supabase Storage ; ajout d’une photo depuis la galerie pour les recettes personnelles, confirmé sur téléphone. Les photos sont publiques dans ce prototype, avec des droits d’écriture limités au dossier du propriétaire.
- Parcours Recettes adapté aux éléments retenus de Figma, avec fonctionnement confirmé : en-tête, filtres, collection, choix d’ajout et formulaire ; difficulté facultative et étiquettes enregistrées en base. Petit budget et les choix IA affichent « Disponible prochainement ».
- Collecte des produits et promotions Maxi avec Apify, avec vérification des données.
- Échantillons de produits Metro et Super C disponibles au format JSON.
- Extraction locale des reçus et vérification des prix sur un échantillon Maxi et Metro.
- Pipeline de correspondance entre reçus Maxi et fiches web PC Express, testé sur cinq produits.

À faire :

- Valider les échantillons Metro et Super C et développer leur collecte automatisée.
- Compléter la validation de l’extraction des reçus, notamment sur Windows et pour Super C.
- Compléter les tables produits/offres et les préférences de compte au-delà du profil minimal.
- Reproduire les parcours sur Android, compléter les essais d’erreur et d’affichage sur différentes tailles d’écran, poursuivre l’adaptation des autres écrans à Figma, puis développer la planification et les listes d’épicerie.
- Intégrer les estimations de prix et la confirmation des reçus dans l’application.
- Compléter les essais de remplacement, retrait et erreur réseau des photos, puis prévoir le nettoyage des fichiers Storage inutilisés.

## Installation

Pour lancer le backend et la documentation en local : **Python 3.11+** et **Git**.

macOS / Linux :

```bash
git clone https://github.com/EnzoT454/OptiMeal.git
cd OptiMeal
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Windows (PowerShell) :

```powershell
git clone https://github.com/EnzoT454/OptiMeal.git
cd OptiMeal
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Sur Windows, si PowerShell bloque l’activation, utiliser directement `.\.venv\Scripts\python.exe` à la place de `python` dans les commandes suivantes, y compris l’installation des dépendances.

## Lancer le backend

Depuis la racine du projet, avec l’environnement virtuel activé, la commande est identique sur macOS, Linux et Windows (PowerShell) :

```text
python -m uvicorn backend.app.main:app --reload --port 8001
```

L’API est accessible sur `http://localhost:8001`, avec sa documentation interactive sur `http://localhost:8001/docs`.

Pour exposer une collecte, définir `CATALOG_IMPORT_PATH` dans le même terminal avant de démarrer le backend. Remplacer `<collecte>` par le nom du dossier contenant le fichier `catalog.json`.

macOS / Linux :

```bash
export CATALOG_IMPORT_PATH="data/catalog/maxi/<collecte>/catalog.json"
```

Windows (PowerShell) :

```powershell
$env:CATALOG_IMPORT_PATH = "data/catalog/maxi/<collecte>/catalog.json"
```

Sans collecte configurée, `/health` fonctionne et les routes historiques
`/catalog` et `/catalog/offers` renvoient une erreur 503. Les nouvelles routes
`/api/v1/ingredients` et `/api/v1/offers` chargent le catalogue JSON commun.
`/api/v1/recipes` et son détail lisent PostgreSQL : configurer la connexion,
appliquer les migrations et lancer les imports avant de les consulter.
Le [guide des contrats](backend/docs/CONTRACTS.md) décrit leurs formats,
filtres et limites pour développer les deux onglets.

Le [guide des migrations](backend/docs/MIGRATIONS.md) décrit la création du
référentiel d’ingrédients, les tables des recettes et leurs imports rejouables.
Le [guide PostgreSQL/Supabase](backend/docs/SUPABASE.md) explique la connexion
optionnelle configurée dans `backend/.env`. `/health/db` vérifie la base par
une lecture simple ; les tables communes et des recettes ainsi que leurs
imports sont disponibles. Les autres tables et le raccordement des offres
restent à développer.

Le [guide du backend](backend/README.md) détaille les routes disponibles et les limites des données. Une [collection Postman](backend/postman/OptiMeal.postman_collection.json) permet aussi d’essayer les requêtes.

## Tests

Le [guide mobile](mobile/README.md) décrit l’installation sur téléphone et les
scénarios de vérification. Les essais manuels sur iPhone ont confirmé le
compte, le profil, la restauration de session et les recettes sans IA, y
compris leur séparation entre deux comptes. Les bundles iOS/Android ont été
générés ; le parcours interactif Android reste à vérifier. L’ajout d’une
photo personnelle depuis la galerie a aussi été confirmé sur téléphone le
21 octobre. Les essais complémentaires de retrait, remplacement et erreur
réseau restent à réaliser. Le fonctionnement des ajustements du parcours
Recettes inspirés de Figma a également été confirmé le 21 octobre ;
cette confirmation ne remplace pas les scénarios détaillés du guide mobile.

Les tests ordinaires utilisent des réponses enregistrées et ne contactent pas Supabase ni les fournisseurs externes. Les tests PostgreSQL demandent une base locale jetable ; la CI en fournit une automatiquement. Voir le [guide des migrations](backend/docs/MIGRATIONS.md#tests). Avec l’environnement virtuel activé, la commande est identique sur macOS, Linux et Windows (PowerShell) :

```text
python -m pytest backend/tests -q
```

Pour le mobile, depuis `mobile/` :

```bash
npm run typecheck
npm test
```

La dernière vérification complète a donné 300 tests backend réussis avec
PostgreSQL local, 10 tests mobiles (photos et règles du formulaire) et des bundles iOS/Android générés.
Le lint mobile n’est pas encore configuré. Le [guide des photos](backend/docs/RECIPE_IMAGES.md)
explique la configuration du bucket, ses droits et les limites du prototype.

## Structure du projet

Voici les principaux fichiers et dossiers actuels. Les composantes marquées « à développer » sont des squelettes conservés pour commencer la programmation.

```text
OptiMeal/
├── README.md                         # Présentation du projet et démarrage
├── README-fonctionnement.md          # Explication des composants, fichiers et flux de données
├── requirements.txt                  # Bibliothèques Python à installer
├── Pipfile                           # Ancienne configuration d’installation de Zensical
├── .gitignore                        # Fichiers et dossiers que Git doit ignorer
├── zensical.toml                     # Configuration du site de suivi
├── .github/workflows/                # Vérifications lancées automatiquement sur GitHub
│   ├── backend.yml                   # Lance les tests Python
│   ├── mobile.yml                    # Vérifie TypeScript et génère les bundles iOS/Android
│   └── docs.yml                      # Construit le site et le publie depuis main
├── backend/                          # Serveur et traitements de l’application
│   ├── README.md                     # Guide de développement du backend
│   ├── app/                          # Code du serveur et des composantes métier
│   │   ├── main.py                   # Démarre FastAPI et ajoute les routes
│   │   ├── config.py                 # Lit les paramètres du serveur
│   │   ├── database.py               # Moteur PostgreSQL et sessions par requête
│   │   ├── security.py               # Validation des jetons auprès de Supabase Auth
│   │   ├── accounts/                 # Identité Supabase et profil minimal
│   │   │   ├── router.py             # Identité vérifiée et profil personnel
│   │   │   ├── schemas.py            # Contrats identité et profil minimal
│   │   │   ├── models.py             # Profil lié à auth.users (géré par Supabase)
│   │   │   └── service.py            # Création idempotente et lecture du profil
│   │   ├── recipes/                  # Lectures, recettes personnelles et favoris
│   │   │   ├── router.py             # Lectures, écritures personnelles et favoris
│   │   │   ├── schemas.py            # Contrats des recettes, ingrédients et étapes
│   │   │   ├── models.py             # Modèles Recipe, RecipeIngredient et Favorite
│   │   │   ├── service.py            # Lectures, mutations et autorisations des recettes
│   │   │   └── seed_import.py        # Import transactionnel et rejouable des recettes
│   │   ├── planning/                 # Calendrier et historique à développer
│   │   │   ├── router.py             # Futures requêtes de planification
│   │   │   ├── schemas.py            # Futurs formats des repas et portions
│   │   │   ├── models.py             # Futures tables des semaines et repas
│   │   │   └── service.py            # Futures règles de sauvegarde des plans
│   │   ├── shopping_lists/           # Listes d’épicerie à développer
│   │   │   ├── router.py             # Futures requêtes de gestion des listes
│   │   │   ├── schemas.py            # Futurs formats des articles et totaux
│   │   │   ├── models.py             # Futures tables des listes
│   │   │   └── service.py            # Futurs calculs, remplacements et recalculs
│   │   ├── common/                   # Contrats et routes communs ; calculs à développer
│   │   │   ├── public_router.py      # Lectures JSON des ingrédients et offres
│   │   │   ├── public_data.py        # Charge le catalogue JSON commun pour l’API
│   │   │   ├── contracts.py          # Pagination, erreurs et conventions partagées
│   │   │   ├── prices.py             # Futurs calculs de prix et de fourchettes
│   │   │   └── units.py              # Futures conversions de quantités
│   │   ├── catalog/                  # Produits, prix et correspondances
│   │   │   ├── router.py             # Permet de consulter le catalogue dans l’API
│   │   │   ├── schemas.py            # Définit et vérifie le format du catalogue
│   │   │   ├── common_catalog.py     # Assemble les catalogues des trois enseignes
│   │   │   ├── common_schemas.py     # Contrats du catalogue commun, ingrédients et offres
│   │   │   ├── ingredient_import.py  # Import transactionnel et rejouable des ingrédients
│   │   │   ├── models.py             # Modèle Ingredient ; produits et magasins à développer
│   │   │   ├── service.py            # Futures règles du catalogue en base
│   │   │   ├── formats.py            # Interprète les formats et vérifie les codes-barres
│   │   │   ├── matching.py           # Propose des liens entre ingrédients et produits
│   │   │   ├── export.py             # Crée les identifiants et les rapports
│   │   │   ├── apify_command.py      # Prépare les collectes, reprises et rejeux
│   │   │   ├── apify_batch.py        # Répartit les recherches et leur budget
│   │   │   └── apify_ingestion.py    # Transforme les réponses Apify en catalogue
│   │   ├── price_sources/            # Connexions aux sources de prix
│   │   │   ├── apify_loblaws.py      # Communique avec Apify pour Maxi
│   │   │   └── pcx_products.py       # Récupère les fiches produits du pilote PC Express
│   │   └── receipts/                 # Lecture et vérification des reçus
│   │       ├── ocr.py                # Lit le texte avec Vision ou Tesseract
│   │       ├── vision_ocr.swift      # Utilise Apple Vision sur Mac
│   │       ├── parser.py             # Reconstruit les articles, quantités et prix
│   │       ├── schemas.py            # Définit le format JSON des reçus
│   │       ├── validation.py         # Vérifie les sommes, taxes et totaux
│   │       ├── web_matching.py       # Relie les articles des reçus Maxi aux fiches web
│   │       └── rules/                # Règles adaptées aux formats des reçus
│   │           ├── common.py         # Règles communes aux magasins
│   │           ├── maxi.py           # Règles des reçus Maxi
│   │           ├── metro.py          # Règles des reçus Metro
│   │           └── generic.py        # Règles pour les autres formats
│   ├── cli/                          # Commandes à lancer dans le terminal
│   │   ├── build_common_catalog.py   # Assemble les catalogues des trois enseignes
│   │   ├── export_shared_contracts.py # Exporte les schémas et exemples v1
│   │   ├── import_ingredients.py     # Importe le référentiel dans PostgreSQL
│   │   ├── import_recipes.py         # Importe les recettes sans doublons
│   │   ├── configure_recipe_images.py # Configure les limites et droits Storage
│   │   ├── ingest_catalog.py         # Collecte ou rejoue les données Apify
│   │   ├── match_maxi_receipts.py    # Prépare et actualise les liens reçus–produits Maxi
│   │   ├── probe_pcx_products.py     # Essaie la récupération des fiches PC Express
│   │   └── extract_receipt.py        # Extrait un reçu vers un fichier JSON
│   ├── config/catalog/               # Paramètres des recherches Maxi
│   │   ├── ingredients.json          # Dix premiers ingrédients et règles de sélection
│   │   ├── apify_queries.json        # Recherches du premier lot
│   │   ├── apify_food_categories.json # Rayons pour les promotions alimentaires
│   │   ├── target_store.json         # Succursale Maxi choisie
│   │   ├── batch2/                   # Deuxième lot de dix ingrédients
│   │   │   ├── ingredients.json      # Ingrédients et règles du deuxième lot
│   │   │   └── apify_queries.json    # Recherches du deuxième lot
│   │   └── batch3/                   # Troisième lot de onze ingrédients
│   │       ├── ingredients.json      # Ingrédients et règles du troisième lot
│   │       └── apify_queries.json    # Recherches du troisième lot
│   ├── config/storage/recipe_images.sql # Politiques du bucket public recipes-images
│   ├── alembic.ini                   # Configuration sans identifiants
│   ├── contracts/v1/                 # OpenAPI, JSON Schema et exemples partagés
│   ├── alembic/                      # Chaîne unique des migrations PostgreSQL
│   │   ├── env.py                    # Connexion et métadonnées applicatives
│   │   └── versions/                 # Ingrédients, recettes et liens quantifiés
│   │       ├── 0001_create_ingredient.py # Référentiel partagé
│   │       ├── 0002_create_recipes.py # Recettes et liens quantifiés
│   │       ├── 0003_accounts_and_ownership.py # Profils, propriété et favoris
│   │       └── 0004_recipe_metadata.py # Difficulté et étiquettes facultatives
│   ├── docs/                         # Guides techniques du backend
│   │   ├── APIFY.md                  # Utilisation du connecteur Maxi
│   │   ├── PCX_PILOT.md              # Utilisation et limites du pilote PC Express
│   │   ├── CATALOG.md                # Format et limites du catalogue
│   │   ├── RECEIPTS.md               # Installation OCR, essais et limites
│   │   ├── DATA.md                   # Organisation et utilité des données
│   │   ├── DATABASE.md               # État implémenté et modèle étendu proposé
│   │   ├── CONTRACTS.md              # Contrats publics Recettes et Promos
│   │   ├── SUPABASE.md               # Connexion PostgreSQL côté serveur
│   │   ├── AUTH.md                   # Supabase Auth, profils et droits
│   │   ├── RECIPE_IMAGES.md          # Photos, Storage, droits et limites du prototype
│   │   ├── MIGRATIONS.md             # Migrations et imports rejouables
│   │   └── examples/                 # Exemples pour expliquer la conception
│   │       └── catalog.proposed.json # Exemple de catalogue avec des prix fictifs
│   ├── postman/                      # Requêtes pour essayer l’API manuellement
│   │   └── OptiMeal.postman_collection.json # Collection à importer dans Postman
│   └── tests/                        # Tests actuels et emplacements des tests futurs
│       ├── test_catalog.py           # Vérifie les formats et correspondances
│       ├── test_apify_catalog.py     # Vérifie la collecte Apify et les routes API
│       ├── test_receipts.py          # Vérifie l’extraction et les montants des reçus
│       ├── conftest.py               # Emplacement réservé aux fixtures partagées
│       ├── test_auth.py              # Validation des jetons Supabase Auth
│       ├── test_database.py          # Configuration et connexion PostgreSQL
│       ├── test_common_catalog.py    # Construction et validation du catalogue commun
│       ├── test_shared_contracts.py  # Contrats HTTP communs et exports v1
│       ├── test_ingredient_import.py # Import des ingrédients et rejeu sans doublons
│       ├── test_accounts.py          # Profils, recettes privées et isolation des comptes
│       ├── test_recipe_image_storage.py # Isolation des écritures Storage entre comptes
│       ├── test_recipes.py           # Contraintes SQL des recettes
│       ├── test_recipe_import.py     # Rejeu, conflits et transactions
│       ├── test_recipe_api.py        # Lectures HTTP sur PostgreSQL local
│       ├── test_recipe_metadata.py   # Difficulté et étiquettes des recettes
│       ├── test_pcx_probe.py         # Récupération des fiches du pilote PC Express
│       ├── test_maxi_web_matching.py # Correspondances entre reçus Maxi et fiches web
│       ├── test_planning.py          # Futurs tests des plans
│       └── test_shopping_lists.py    # Futurs tests des listes
├── mobile/                           # Expo, Supabase Auth et recettes manuelles
│   ├── README.md                     # Lancement et essai sur appareil
│   ├── App.tsx                       # Navigation et barrière de connexion
│   ├── app/                          # Écrans compte et recettes
│   ├── context/AuthContext.tsx       # État du compte et gestion de la session
│   ├── types/                        # Types TypeScript de l’API et de la navigation
│   ├── components/                   # Composants réutilisables du mobile
│   │   ├── RecipeImage.tsx           # Affichage des URL d’images et repli local
│   │   ├── IngredientPicker.tsx      # Recherche et sélection des ingrédients communs
│   │   └── recipes.tsx               # Composants partagés du parcours Recettes
│   ├── services/                     # Auth, client FastAPI et sélection/envoi des photos
│   │   └── recipeForm.ts             # Règles de quantités et badges des recettes
│   ├── tests/                        # Tests des services mobiles
│   │   ├── recipeImages.test.cjs     # Tests du service photo avec doubles natifs
│   │   └── recipeForm.test.cjs       # Tests des règles du formulaire de recette
│   ├── metro.config.js              # Inclusion des illustrations locales de secours
│   └── package-lock.json             # Dépendances mobiles verrouillées
├── data/                             # Données et résultats pouvant être ajoutés à Git
│   ├── README.md                     # Repères pour comprendre les données
│   ├── catalog/maxi/                 # Collectes Apify, rapports et sélections
│   │   └── data_final/               # Données Maxi regroupées
│   │       ├── README.md             # Format commun et validation Maxi
│   │       ├── produits.json         # Les 31 produits sélectionnés
│   │       └── promos.json           # Les 196 offres promotionnelles
│   ├── catalog/maxi/archives/         # Ancien format Maxi complet et validation conservés
│   ├── catalog/baseCommune/          # 31 ingrédients et 93 fiches produits
│   ├── catalog/metro/                # Échantillon de 31 produits Metro
│   ├── recipes/                      # 10 recettes et guide de leur import
│   │   └── images/                   # Illustrations initiales conservées localement
│   ├── catalog/superc/
│   │   └── produits.json             # Les 31 ingrédients et produits Super C fournis
│   ├── receipts/                     # Images, extractions et diagnostics des reçus
│   │   ├── images/                   # Photos originales
│   │   ├── extractions/              # Articles et montants extraits en JSON
│   │   ├── ocr/                      # Texte brut sauvegardé pour le rejeu
│   │   ├── archives/                 # Anciens essais de lecture
│   │   └── receipt.schema.json       # Description du format JSON des reçus
│   └── archives/                     # Essais des pistes abandonnées
│       ├── README.md                 # Explique les anciens essais
│       ├── circulaires/              # PDF sources conservés
│       └── epiceries/                # Anciennes études et collectes épiceries.ca
└── docs/                             # Pages du site de suivi du cours
    ├── index.md                      # Objectifs, présentation et échéancier
    ├── suivi.md                      # Avancement semaine par semaine
    ├── synthese.md                   # Bilan final à compléter
    ├── references.md                 # Sources et utilisation de l’IA
    └── css/no-sidebar.css            # Ajuste l’apparence du site
```

Les fichiers `__init__.py` identifient les dossiers Python comme des packages ; ils ne sont pas répétés dans l’arbre. Les captures et anciennes sorties de `data/` sont détaillées dans le [guide des données](backend/docs/DATA.md). Les dossiers générés comme `site/`, `.venv/`, `.cache/` et `__pycache__/` sont ignorés par Git et ne figurent pas ici. Le socle mobile est dans `mobile/` ; voir son [guide de lancement](mobile/README.md).

Le dossier `tools/` contient les notes locales d’architecture, décisions,
tâches et consignes. Il est actuellement ignoré par Git : les guides partagés
avec une nouvelle copie du dépôt sont les README, `backend/docs/` et `docs/`.

## Documentation

- [Comprendre le fonctionnement de l’application et du dépôt](README-fonctionnement.md)
- [Structure et utilisation des données locales](backend/docs/DATA.md)
- [Catalogue pilote : utilisation et résultats](backend/docs/CATALOG.md)
- [Extraction locale des reçus](backend/docs/RECEIPTS.md)
- [État et modèle de données](backend/docs/DATABASE.md)
- [Contrats communs Recettes et Promos](backend/docs/CONTRACTS.md)
- [Connexion Supabase](backend/docs/SUPABASE.md)
- [Authentification et droits](backend/docs/AUTH.md)
- [Photos des recettes et Supabase Storage](backend/docs/RECIPE_IMAGES.md)
- [Démarrer le mobile](mobile/README.md)
- [Migrations et imports](backend/docs/MIGRATIONS.md)

Le [site de suivi du projet](https://enzot454.github.io/OptiMeal/) regroupe nos objectifs, notre avancement et les références utilisées. Il reprend le [template du cours IFT3150](https://github.com/udem-diro/template-projet).

Pour le consulter en local, ouvrir un autre terminal à la racine du projet et activer l’environnement virtuel avec la commande correspondant à votre système dans la section Installation. Les commandes suivantes sont identiques sur macOS, Linux et Windows (PowerShell).

```text
python -m zensical serve
```

Le site est accessible sur `http://localhost:8000`. Pour vérifier sa construction :

```text
python -m zensical build --clean
```

La publication sur GitHub Pages se fait automatiquement lors des mises à jour de `main`.

## Équipe

- Hamza Aqel
- Nouh Harfouche

**Superviseur :** Louis Edouard Lafontant<br>
**Session :** Automne 2026<br>
**Cours :** IFT3150 — Projet informatique, Université de Montréal

*Dernière mise à jour : 22 octobre 2026*

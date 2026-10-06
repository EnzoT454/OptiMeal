<h1 align="center">OptiMeal</h1>

<p align="center">
  Planifier ses repas et préparer sa liste d’épicerie selon son budget.
</p>

Nous développons OptiMeal dans le cadre du cours IFT3150 à l’Université de Montréal. L’idée est de réunir les recettes, les repas de la semaine et les prix des épiceries au même endroit pour faciliter la préparation des courses.

L’application permettra de choisir ses recettes et ses portions, puis de préparer une liste d’achats par magasin en tenant compte du budget et des déplacements. Trois modes d’ajout sont prévus : ajouter une recette manuellement, trouver une idée et cuisiner avec ce qu’on a déjà. L’ajout manuel donnera le choix entre remplir un formulaire et saisir un texte que l’IA transformera dans le même format de recette, à vérifier avant de l’enregistrer.

Lorsque les prix précis manquent, nous afficherons une fourchette estimée min–max, en signalant les articles dont le prix reste impossible à estimer. À la fin des courses, l’utilisateur pourra aussi photographier son reçu et confirmer les prix extraits pour contribuer aux estimations. Cette contribution sera facultative.

## Technologies

- **Mobile prévu :** React Native · TypeScript · Expo, pour iOS et Android
- **Backend :** Python · FastAPI
- **Base de données prévue :** PostgreSQL
- **Documentation :** Zensical · GitHub Pages

## Statut actuel

Nous avons mis en place le site de suivi, une API FastAPI et un [connecteur Apify pour Maxi](backend/docs/APIFY.md). Le catalogue conserve les réponses sources, propose des correspondances avec les ingrédients et peut être consulté dans l’API. Trois lots couvrent les recherches de 31 ingrédients ; la collecte des promotions alimentaires est également disponible. Les données Maxi récupérées avec Apify ont été vérifiées : les produits, les prix et la succursale Maxi Côte-des-Neiges sont corrects. Cette validation a été consignée le 4 octobre 2026.

Pour Metro et Super C, nous retenons l’extraction des pages web avec un modèle IA. Ce traitement reste à développer et à évaluer. Épiceries.ca et les circulaires PDF ont été testés auparavant ; ils ne sont plus retenus pour la collecte.

L’extraction locale des reçus conserve deux chemins : Apple Vision sur Mac et Tesseract + OpenCV pour Windows. Le 4 octobre 2026, les prix extraits des reçus Maxi et Metro de notre échantillon ont été confirmés. Le [guide OCR](backend/docs/RECEIPTS.md#validation-humaine-des-prix--4-octobre-2026) détaille les limites : Super C et l’exécution sur un PC Windows restent à valider, et Apple Vision garde une erreur sur le rabais du reçu Metro.

L’application mobile, les comptes, PostgreSQL et le parcours de confirmation des reçus restent à développer. Les prochaines étapes sont de préparer la collecte Metro/Super C, mettre en place PostgreSQL et relier le mobile au serveur.

## Installation

Pour lancer le backend et la documentation en local : **Python 3.11+** et **Git**.

```bash
git clone https://github.com/EnzoT454/OptiMeal.git
cd OptiMeal
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

## Lancer le backend

Depuis la racine du projet, avec l’environnement virtuel activé :

```bash
python -m uvicorn backend.app.main:app --reload --port 8001
```

L’API est accessible sur `http://localhost:8001`, avec sa documentation interactive sur `http://localhost:8001/docs`.

Pour exposer une collecte, exporter aussi `CATALOG_IMPORT_PATH=data/catalog/maxi/<collecte>/catalog.json` avant le démarrage. Sans catalogue configuré, `/health` fonctionne et les routes du catalogue renvoient une erreur 503.

Le [guide du backend](backend/README.md) détaille les routes disponibles et les limites des données. Une [collection Postman](backend/postman/OptiMeal.postman_collection.json) permet aussi d’essayer les requêtes.

## Tests

Les tests du backend utilisent des réponses enregistrées et ne font pas d’appels réseau :

```bash
python -m pytest backend/tests -q
```

## Structure du projet

Voici les principaux fichiers et dossiers actuels. Les composantes marquées « à développer » sont des squelettes conservés pour commencer la programmation.

```text
OptiMeal/
├── README.md                         # Présentation du projet et démarrage
├── requirements.txt                  # Bibliothèques Python à installer
├── Pipfile                           # Ancienne configuration d’installation de Zensical
├── .gitignore                        # Fichiers et dossiers que Git doit ignorer
├── zensical.toml                     # Configuration du site de suivi
├── .github/workflows/                # Vérifications lancées automatiquement sur GitHub
│   ├── backend.yml                   # Lance les tests Python
│   └── docs.yml                      # Construit le site et le publie depuis main
├── backend/                          # Serveur et traitements de l’application
│   ├── README.md                     # Guide de développement du backend
│   ├── .env.example                  # Exemple des variables de configuration
│   ├── app/                          # Code du serveur et des composantes métier
│   │   ├── main.py                   # Démarre FastAPI et ajoute les routes
│   │   ├── config.py                 # Lit les paramètres du serveur
│   │   ├── database.py               # Accès PostgreSQL à développer
│   │   ├── security.py               # Authentification à développer
│   │   ├── accounts/                 # Comptes et profils à développer
│   │   │   ├── router.py             # Futures requêtes de connexion et de profil
│   │   │   ├── schemas.py            # Futurs formats des données de comptes
│   │   │   ├── models.py             # Futures tables des utilisateurs
│   │   │   └── service.py            # Futures règles de gestion des comptes
│   │   ├── recipes/                  # Recettes et favoris à développer
│   │   │   ├── router.py             # Futures requêtes de gestion des recettes
│   │   │   ├── schemas.py            # Futurs formats des recettes et ingrédients
│   │   │   ├── models.py             # Futures tables des recettes
│   │   │   └── service.py            # Futures règles de création et modification
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
│   │   ├── common/                   # Fonctions partagées à développer
│   │   │   ├── prices.py             # Futurs calculs de prix et de fourchettes
│   │   │   └── units.py              # Futures conversions de quantités
│   │   ├── catalog/                  # Produits, prix et correspondances
│   │   │   ├── router.py             # Permet de consulter le catalogue dans l’API
│   │   │   ├── schemas.py            # Définit et vérifie le format du catalogue
│   │   │   ├── models.py             # Futures tables des produits et magasins
│   │   │   ├── service.py            # Futures règles du catalogue en base
│   │   │   ├── formats.py            # Interprète les formats et vérifie les codes-barres
│   │   │   ├── matching.py           # Propose des liens entre ingrédients et produits
│   │   │   ├── export.py             # Crée les identifiants et les rapports
│   │   │   ├── apify_command.py      # Prépare les collectes, reprises et rejeux
│   │   │   ├── apify_batch.py        # Répartit les recherches et leur budget
│   │   │   └── apify_ingestion.py    # Transforme les réponses Apify en catalogue
│   │   ├── price_sources/            # Connexions aux sources de prix
│   │   │   └── apify_loblaws.py      # Communique avec Apify pour Maxi
│   │   └── receipts/                 # Lecture et vérification des reçus
│   │       ├── ocr.py                # Lit le texte avec Vision ou Tesseract
│   │       ├── vision_ocr.swift      # Utilise Apple Vision sur Mac
│   │       ├── parser.py             # Reconstruit les articles, quantités et prix
│   │       ├── schemas.py            # Définit le format JSON des reçus
│   │       ├── validation.py         # Vérifie les sommes, taxes et totaux
│   │       └── rules/                # Règles adaptées aux formats des reçus
│   │           ├── common.py         # Règles communes aux magasins
│   │           ├── maxi.py           # Règles des reçus Maxi
│   │           ├── metro.py          # Règles des reçus Metro
│   │           └── generic.py        # Règles pour les autres formats
│   ├── cli/                          # Commandes à lancer dans le terminal
│   │   ├── ingest_catalog.py         # Collecte ou rejoue les données Apify
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
│   ├── alembic/                      # Base des futures migrations PostgreSQL
│   │   ├── env.py                    # Configuration des migrations à compléter
│   │   └── versions/                 # Emplacement des futures migrations
│   │       └── .gitkeep              # Conserve ce dossier vide dans Git
│   ├── docs/                         # Guides techniques du backend
│   │   ├── APIFY.md                  # Utilisation du connecteur Maxi
│   │   ├── CATALOG.md                # Format et limites du catalogue
│   │   ├── RECEIPTS.md               # Installation OCR, essais et limites
│   │   ├── DATA.md                   # Organisation et utilité des données
│   │   ├── DATABASE.md               # Modèle PostgreSQL proposé
│   │   └── examples/                 # Exemples pour expliquer la conception
│   │       └── catalog.proposed.json # Exemple de catalogue avec des prix fictifs
│   ├── postman/                      # Requêtes pour essayer l’API manuellement
│   │   └── OptiMeal.postman_collection.json # Collection à importer dans Postman
│   └── tests/                        # Tests actuels et emplacements des tests futurs
│       ├── test_catalog.py           # Vérifie les formats et correspondances
│       ├── test_apify_catalog.py     # Vérifie la collecte Apify et les routes API
│       ├── test_receipts.py          # Vérifie l’extraction et les montants des reçus
│       ├── conftest.py               # Base des futures données de test partagées
│       ├── test_accounts.py          # Futurs tests des comptes
│       ├── test_recipes.py           # Futurs tests des recettes
│       ├── test_planning.py          # Futurs tests des plans
│       └── test_shopping_lists.py    # Futurs tests des listes
├── data/                             # Données et résultats pouvant être ajoutés à Git
│   ├── README.md                     # Repères pour comprendre les données
│   ├── catalog/maxi/                 # Collectes Apify, rapports et sélections
│   │   └── data_final/               # Données Maxi regroupées
│   │       ├── README.md             # Format commun et validation Maxi
│   │       ├── produits.json         # Les 31 produits sélectionnés
│   │       └── promos.json           # Les 196 offres promotionnelles
│   ├── catalog/maxi/archives/         # Ancien format Maxi complet et validation conservés
│   ├── catalog/superc/
│   │   └── produits.json             # Les 31 ingrédients et produits Super C fournis
│   ├── message.txt                   # Source des données Super C
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
├── docs/                             # Pages du site de suivi du cours
│   ├── index.md                      # Objectifs, présentation et échéancier
│   ├── suivi.md                      # Avancement semaine par semaine
│   ├── synthese.md                   # Bilan final à compléter
│   ├── references.md                 # Sources et utilisation de l’IA
│   └── css/no-sidebar.css            # Ajuste l’apparence du site
├── presentations/                    # Supports du cours, ignorés par Git
│   └── miseEC1.md                    # Préparation de la première présentation
└── tools/                            # Documents de travail, ignorés par Git
    ├── AGENTS.md                     # Consignes pour travailler sur le projet
    ├── ARCHITECTURE.md               # Organisation et fonctionnement prévus
    ├── API.md                        # Routes actuelles et futures
    ├── DECISIONS.md                  # Choix retenus et questions ouvertes
    └── TASKS.md                      # Tâches, étapes et critères de validation
```

Les fichiers `__init__.py` identifient les dossiers Python comme des packages ; ils ne sont pas répétés dans l’arbre. Les captures et anciennes sorties de `data/` sont détaillées dans le [guide des données](backend/docs/DATA.md). Les dossiers générés comme `site/`, `.venv/`, `.cache/` et `__pycache__/` sont ignorés par Git et ne figurent pas ici. Le dossier mobile reste à créer.

## Documentation

- [Structure et utilisation des données locales](backend/docs/DATA.md)
- [Catalogue pilote : utilisation et résultats](backend/docs/CATALOG.md)
- [Extraction locale des reçus](backend/docs/RECEIPTS.md)
- [Modèle de données proposé](backend/docs/DATABASE.md)

Le [site de suivi du projet](https://enzot454.github.io/OptiMeal/) regroupe nos objectifs, notre avancement et les références utilisées. Il reprend le [template du cours IFT3150](https://github.com/udem-diro/template-projet).

Pour le consulter en local, lancer cette commande dans un autre terminal avec l’environnement virtuel activé :

```bash
zensical serve
```

Le site est accessible sur `http://localhost:8000`. Pour vérifier sa construction : `zensical build --clean`. La publication sur GitHub Pages se fait automatiquement lors des mises à jour de `main`.

## Équipe

- Hamza Aqel
- Nouh Harfouche

**Superviseur :** Louis Edouard Lafontant<br>
**Session :** Automne 2026<br>
**Cours :** IFT3150 — Projet informatique, Université de Montréal

*Dernière mise à jour : 4 octobre 2026*

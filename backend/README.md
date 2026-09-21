# Backend OptiMeal

Ce dossier contient l'API du projet OptiMeal. Le backend reçoit les demandes de l'application mobile, applique les règles métier, lit ou écrit les données dans PostgreSQL et communique avec les sources externes de prix.

L'architecture est un **monolithe modulaire FastAPI** : une seule application à déployer, divisée par domaines métier. Ce choix est adapté au projet : les fonctions recettes, planification, liste d'achats et prix sont étroitement liées, et l'équipe peut les développer et les tester sans la complexité de microservices.

## État actuel

Le connecteur **épiceries.ca** est fonctionnel et couvert par des tests sans réseau. Il fournit les routes suivantes :

- `GET /health`
- `GET /sources/epiceries/categories`
- `GET /sources/epiceries/search?q=riz&limit=3`
- `GET /sources/epiceries/products/{id}`

Les modules `accounts`, `recipes`, `planning`, `shopping_lists` et le stockage PostgreSQL sont des squelettes intentionnels : leur structure est prête, mais leurs routes et modèles ne sont pas encore implémentés.

### Recherche de produits

`GET /sources/epiceries/search` transmet la requête au fournisseur, puis améliore localement la pertinence pour un usage d'épicerie. Par défaut, `food_only=true` retire les catégories explicitement non alimentaires du fournisseur (ménage, hygiène/beauté, animaux et bébé) et, avec le tri fournisseur par défaut (`updated_desc`), classe les noms commençant par la requête avant les correspondances où elle apparaît plus loin. Les tris de prix restent ceux du fournisseur. Ainsi, une recherche `q=miel` ne propose pas un shampoing au miel avant un aliment.

Le champ `filter` de la réponse expose les catégories retirées, le nombre de résultats fournisseur et le mode de classement. `data.count` est le nombre réellement renvoyé après filtrage ; `hasMore` demeure l'indication du fournisseur. Utiliser `food_only=false` pour obtenir aussi les catégories non alimentaires. Un paramètre `category` explicite est toujours respecté et désactive ce filtre local.

## Flux d'une requête

```text
Application mobile / Postman
            |
            v
        router.py              Route HTTP : paramètres, réponse et statut HTTP
            |
            v
        service.py             Règles métier et autorisations
            |
      +-----+------+------------------+
      |            |                  |
      v            v                  v
 models.py    price_sources/      common/
 PostgreSQL   API externe          unités et prix partagés
      |
      v
 schemas.py -> JSON validé renvoyé au client
```

Pour le connecteur disponible aujourd'hui :

```text
Route catalogue -> epiceries_ca.py -> cache + limite de débit -> épiceries.ca
       |                                                               |
       +-------- normalize.py <- données fournisseur validées --------+
```

Le backend conserve les données brutes et renvoie des avertissements de qualité (prix ancien, format non interprétable, prix détaillé incohérent, etc.). Un résultat HTTP `200` ne garantit pas qu'un prix soit valide dans une succursale.

## Arborescence et rôle des fichiers

```text
backend/
├── app/
│   ├── __init__.py             # Marque app comme package Python
│   ├── main.py                 # Crée FastAPI, ajoute les routes et /health
│   ├── config.py               # Lit DATABASE_URL, JWT_SECRET et options externes
│   ├── database.py             # Futur point unique SQLAlchemy/PostgreSQL
│   ├── security.py             # Futur hashage des mots de passe et JWT
│   │
│   ├── accounts/               # Domaine comptes utilisateurs
│   │   ├── router.py           # Futures routes /auth et /users
│   │   ├── schemas.py          # JSON inscription, connexion et profil
│   │   ├── models.py           # Futures tables User et préférences
│   │   └── service.py          # Inscription, connexion et règles d'accès
│   │
│   ├── recipes/                # Domaine recettes et ingrédients
│   │   ├── router.py           # Futures routes /recipes
│   │   ├── schemas.py          # Formats JSON des recettes
│   │   ├── models.py           # Futures tables Recipe et Ingredient
│   │   └── service.py          # CRUD, favoris et ajustement des portions
│   │
│   ├── planning/               # Domaine planification hebdomadaire
│   │   ├── router.py           # Futures routes /plans ou /weeks
│   │   ├── schemas.py          # Jours, repas et portions
│   │   ├── models.py           # Semaines et repas planifiés
│   │   └── service.py          # Validation et historique des semaines
│   │
│   ├── shopping_lists/         # Domaine listes d'achats
│   │   ├── router.py           # Futures routes /shopping-lists
│   │   ├── schemas.py          # Articles et totaux de liste
│   │   ├── models.py           # Listes et articles persistés
│   │   └── service.py          # Agrégation, remplacement et recalcul
│   │
│   ├── catalog/                # Domaine catalogue, magasins et prix internes
│   │   ├── router.py           # Routes épiceries.ca actuellement disponibles
│   │   ├── schemas.py          # Futurs schémas catalogue OptiMeal
│   │   ├── models.py           # Futures tables Product, Store, PriceObservation
│   │   └── service.py          # Futures recherches et règles de prix internes
│   │
│   ├── price_sources/          # Connecteurs de données de prix externes
│   │   ├── epiceries_ca.py     # HTTP, cache, débit limité et erreurs fournisseur
│   │   ├── schemas.py          # Contrat Pydantic spécifique à épiceries.ca
│   │   └── normalize.py        # Conversion vers le format d'offre OptiMeal
│   │
│   └── common/                 # Fonctions réutilisables, sans domaine métier
│       ├── units.py            # Futures conversions g/kg/ml/L
│       └── prices.py           # Futurs types prix, fourchettes et avertissements
│
├── tests/
│   ├── conftest.py             # Futures fixtures partagées (client, base test)
│   ├── fixtures/               # Réponses fournisseur enregistrées, sans réseau
│   ├── test_epiceries.py       # Tests actuels du connecteur épiceries.ca
│   ├── test_accounts.py        # Emplacement des futurs tests comptes
│   ├── test_recipes.py         # Emplacement des futurs tests recettes
│   ├── test_planning.py        # Emplacement des futurs tests planification
│   └── test_shopping_lists.py  # Emplacement des futurs tests listes
│
├── alembic/
│   ├── env.py                  # Configuration de migration à compléter avec SQLAlchemy
│   │                            # et Alembic
│   └── versions/               # Une migration PostgreSQL par changement de schéma
│
├── postman/                    # Collection pour essayer l'API manuellement
├── smoke.py                    # Parcours réel catégories -> recherche -> détail
└── .env.example                # Variables à copier dans un environnement local
```

## Convention pour un nouveau domaine

- `router.py` : couche HTTP uniquement. Elle valide les paramètres, appelle le service et renvoie le bon code HTTP. Ne pas y placer de calcul métier.
- `schemas.py` : contrats d'entrée et de sortie avec Pydantic. Ils empêchent notamment de renvoyer des champs internes ou sensibles.
- `models.py` : modèles SQLAlchemy représentant les tables PostgreSQL.
- `service.py` : règles métier. Au début, il peut contenir les requêtes SQLAlchemy simples ; un `repository.py` ne sera créé que si ces requêtes deviennent réutilisées ou complexes.

## Lancer le backend

Depuis la racine du dépôt :

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
export EPICERIES_ENABLED=true
python -m uvicorn backend.app.main:app --reload --port 8001
```

Documentation interactive : <http://127.0.0.1:8001/docs>.

Exécuter les tests sans réseau :

```bash
python -m pytest backend/tests -q
```

Le test réel est volontairement séparé, car il dépend du fournisseur :

```bash
python -m backend.smoke
```

## Étapes suivantes

1. Ajouter SQLAlchemy, Alembic et PostgreSQL dans `database.py`.
2. Implémenter `accounts` et ses tests avant de protéger les routes privées.
3. Implémenter `recipes`, puis `planning`.
4. Construire `shopping_lists` à partir des recettes, plans et prix.
5. Ajouter progressivement les autres sources de prix dans `price_sources/`.

# Connexion PostgreSQL / Supabase

Le serveur peut vérifier PostgreSQL via `GET /health/db`. Les routes
Recettes lisent PostgreSQL ; les ingrédients et Promos restent sur JSON. Aucune table, migration
ou import persistant n’est créé par le démarrage ou ce contrôle.

## Installation et configuration

Depuis la racine, avec l’environnement virtuel activé :

```bash
python -m pip install -r requirements.txt
python -m uvicorn backend.app.main:app --reload --port 8001
```

Les versions de SQLAlchemy, Psycopg, Alembic et python-dotenv sont fixées
dans `requirements.txt`. SQLAlchemy/Psycopg assurent la connexion ;
python-dotenv lit la configuration locale ; Alembic gère les migrations
applicatives, à commencer par le référentiel commun d’ingrédients.

Dans Supabase, ouvrir **Connect** et copier la chaîne PostgreSQL du projet.
Le Session pooler convient aux réseaux IPv4 ; la connexion directe convient
si le réseau permet d’atteindre son adresse. Conserver exactement l’hôte,
l’utilisateur et le port fournis. Voir le
[guide Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

Configurer ensuite `DATABASE_URL` dans `backend/.env`, ignoré par Git :

```dotenv
DATABASE_URL=postgresql+psycopg://USER:PASSWORD_ENCODED@HOST:5432/postgres?sslmode=require
```

Les caractères réservés du mot de passe doivent être encodés pour une URL.
Ce mot de passe est celui de PostgreSQL, pas une clé API Supabase.
La forme `postgresql://…` est également acceptée et utilise Psycopg 3.
La connexion reste côté serveur ; aucune URL de connexion n’est retournée
par les routes ni incluse dans l’export OpenAPI.

## Chargement et cycle de vie

`load_settings()` lit `backend/.env` au démarrage de chaque application.
Les variables d’environnement prévalent, y compris une chaîne vide qui
désactive la connexion. Le chargement ne modifie pas `os.environ` et ne
se produit pas à l’import des modules. Les commandes de collecte Apify et
PCX conservent leurs règles existantes d’export des variables.

Chaque application dispose de son propre moteur et de sa fabrique de
sessions. Le moteur n’ouvre pas de connexion au démarrage. Une requête DB
utilise `Depends(get_db)` ; sa session est fermée après utilisation. Les
futurs services métier géreront explicitement leurs transactions et commits.
Le moteur est libéré à l’arrêt, y compris si le chargement initial échoue.

Une URL absente, invalide ou un pilote non pris en charge laisse la base
indisponible sans empêcher les lectures JSON. Le pilote attendu est
`postgresql+psycopg`, avec pré-vérification des connexions réutilisées et
un délai de connexion de 10 secondes. Les erreurs DB retournées au client
restent génériques, sans identifiants ni détails du pilote.

## Vérification

Dans `http://localhost:8001/docs`, appeler `/health/db` :

```json
{
  "status": "ok",
  "database": "reachable"
}
```

Cette réponse 200 signifie que `SELECT 1` a réussi. Elle ne vérifie pas
encore les tables applicatives, les migrations ou Supabase Auth.
Sans configuration ou si la base est inaccessible, la réponse est 503 :

```json
{
  "detail": "Database unavailable"
}
```

`/health` reste à 200 et `/api/v1/offers` reste disponible si son JSON est
valide. Les lectures Recettes renvoient 503 sans connexion opérationnelle,
200 avec une liste vide si la base ne contient aucune recette, et 404 pour
un identifiant absent dans une base accessible. Redémarrer le serveur après
modification de la configuration.

## Tests et migrations

```bash
python -m pytest backend/tests -q
python -m backend.cli.export_shared_contracts --check
```

Les tests ordinaires ne contactent pas Supabase. Ils couvrent la configuration
absente ou invalide, les erreurs de connexion, les sessions, l’arrêt du moteur
et la conservation des lectures JSON. Un test du cycle SQLAlchemy utilise
SQLite localement ; il ne remplace pas le contrôle réel de PostgreSQL.

Alembic est configuré avec `0001_ingredients`, `0002_recipes`, `0003_accounts` et `0004_recipe_metadata`,
ainsi que les commandes d’import rejouables des 31 ingrédients et 10 recettes.
Les tables et imports sont disponibles ; `/api/v1/recipes` et son détail
lisent PostgreSQL à chaque requête, sans chargement du JSON de recettes. Le [guide des migrations](MIGRATIONS.md)
donne les commandes et explique le travail à deux. Le raccordement
des offres à PostgreSQL reste à réaliser en conservant les
[contrats publics](CONTRACTS.md). Aucun de ces traitements n’est lancé
automatiquement par `/health/db`.

Supabase Auth est intégré au serveur et au mobile. Voir [AUTH.md](AUTH.md)
pour les profils, les jetons et les droits sur les recettes personnelles.

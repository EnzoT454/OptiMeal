# Contrats communs — Recettes et Promos v1

Les contrats HTTP `1.0` couvrent les lectures et les écritures manuelles de recettes sous `/api/v1`. Ils
permettent de développer les deux onglets. Les recettes sont lues dans
PostgreSQL/Supabase ; les ingrédients et les offres restent sur JSON.
Les routes historiques `/catalog` et
`/catalog/offers` conservent leur comportement et leur format.

## Démarrage

Depuis la racine, avec l’environnement Python activé :

```bash
python -m backend.cli.build_common_catalog
python -m alembic -c backend/alembic.ini upgrade head
python -m backend.cli.import_ingredients
python -m backend.cli.import_recipes
python -m backend.cli.export_shared_contracts --check
python -m uvicorn backend.app.main:app --reload --port 8001
```

Configurer `DATABASE_URL` côté serveur selon le [guide Supabase](SUPABASE.md),
puis ouvrir `http://localhost:8001/docs`. Les recettes sont relues en base à
chaque requête et ne dépendent plus des fichiers locaux. Une base vide renvoie
une liste vide ; une base inaccessible ou des tables absentes renvoient 503.
Aucun repli sur le JSON ne masque une panne. Le serveur ne lance ni collecte,
ni appel IA, ni migration ou import automatique.

Les ingrédients et les offres utilisent toujours le fichier
`data/catalog/baseCommune/ingredients.json`, configurable avec
`COMMON_CATALOG_PATH` et chargé au démarrage. Un catalogue local invalide
bloque ces lectures, mais pas les recettes en base. `RECIPE_SEED_PATH` sert
à la commande d’import, sans modifier les recettes exposées tant que cet
import n’a pas eu lieu. La commande d’export valide les fichiers de départ
hors réseau. `/health` reste disponible sans base ni catalogue.

## Routes et filtres

| Méthode et route | Réponse | Filtres |
| --- | --- | --- |
| `GET /api/v1/ingredients` | Liste du référentiel commun | `q`, `limit`, `offset` |
| `GET /api/v1/recipes` | Liste résumée des recettes initiales | `q`, `quick`, `favorites`, `limit`, `offset` |
| `GET /api/v1/recipes/{id}` | Recette complète accessible, avec ingrédients et étapes | — |
| `POST /api/v1/recipes` | Créer une recette personnelle, propriétaire issu du jeton | Connexion requise |
| `PUT /api/v1/recipes/{id}` | Remplacer sa propre recette | Connexion requise |
| `DELETE /api/v1/recipes/{id}` | Supprimer sa propre recette | Connexion requise |
| `PUT / DELETE /api/v1/recipes/{id}/favorite` | Ajouter/retirer son favori | Connexion requise |
| `GET /api/v1/offers` | Prix relevés avec produit, format et contexte | `ingredient_id`, `retailer`, `store_id`, `promotion_only`, `on_date`, `limit`, `offset` |
| `GET /api/v1/offers/{id}` | Détail d’un prix relevé | `on_date` |

Exemples :

```text
/api/v1/recipes?limit=10
/api/v1/recipes/recipe_poulet_riz_brocoli
/api/v1/recipes?quick=true
/api/v1/offers?ingredient_id=ing_tomate_fraiche&retailer=metro
/api/v1/offers?promotion_only=true&on_date=2026-10-06
```

La dernière URL interroge explicitement une période historique. Sans
`on_date`, la date d’évaluation est le jour courant dans `America/Toronto`.
Les dates ne prouvent pas le stock ni l’exactitude actuelle d’une capture.
La dépendance `tzdata` est ajoutée pour Windows, qui ne fournit généralement
pas la base IANA utilisée par `zoneinfo` ; elle est installée avec
`requirements.txt`. Voir la [documentation Python](https://docs.python.org/3/library/zoneinfo.html#data-sources).

`q` effectue une recherche partielle sans distinction de casse ou d’accents,
avec équivalence `œ`/`oe`. Pour les ingrédients, les alias sont aussi
consultés. Le filtre Rapides correspond à `total_time_minutes <= 30`,
préparation comprise. Pour ce petit catalogue, les noms candidats sont
normalisés en Python ; les filtres de durée, le comptage et la pagination
sont exécutés dans PostgreSQL. Création manuelle, édition, suppression et
favoris utilisent Supabase Auth ; les parcours IA restent à implémenter.
Sans jeton, seules les recettes initiales sont visibles ; avec un jeton
valide, les recettes personnelles du compte s’ajoutent. `favorites=true`
exige une session. Les droits et routes sont décrits dans [AUTH.md](AUTH.md).

## Identifiants partagés

| Identifiant | Convention |
| --- | --- |
| Ingrédient | Clé stable `ing_…` identique dans catalogue et recettes |
| Recette initiale | `recipe_` suivi de son `seed_key`, par exemple `recipe_poulet_riz_brocoli` |
| Produit | Identifiant de fiche qualifié du catalogue commun, par exemple `maxi:8661:21004355001_EA` |
| Enseigne | `maxi`, `metro`, `superc` |
| Succursale API | Identifiant qualifié, par exemple `metro:178` ; le code marchand seul reste dans `external_store_id` |
| Offre | `offer_…`, empreinte de l’ingrédient et de la fiche source ; stable à données identiques, renouvelée si la fiche change |

Le mobile traite les identifiants comme des chaînes opaques. Il n’en extrait
pas des codes par découpage. Les `Id` numériques propres aux trois fichiers
sources ne deviennent pas des références communes. Les éventuels UUID SQL
seront internes : l’import conservera les clés publiques et les associations.

## Réponses, pagination et erreurs

Toutes les listes suivent la même enveloppe :

```json
{
  "items": [],
  "total": 0,
  "limit": 20,
  "offset": 0,
  "meta": {
    "contract_version": "1.0",
    "data_source": "local_json",
    "dataset_kind": "source_snapshot",
    "review_required": true,
    "warnings": []
  }
}
```

`total` compte les résultats après filtres et avant pagination. `limit`
vaut 20 par défaut et accepte 1 à 100 ; `offset` est positif ou nul. Un
décalage au-delà de la fin retourne `items: []`. Les recettes sont ordonnées
par identifiant ; les ingrédients et les offres suivent le jeu source.
Un détail utilise
`{"item": …, "meta": …}`. Les recettes initiales portent
`dataset_kind: demo` et un avertissement indiquant leur statut de propositions.
Leur métadonnée `data_source` vaut `postgresql` ; elle reste `local_json`
pour les ingrédients et les offres. `review_required` d’une recette reprend
le booléen stocké ; la métadonnée de ce jeu de démonstration reste prudente
et indique toujours qu’une revue du jeu est nécessaire.

Les erreurs v1 ont la forme suivante :

```json
{
  "error": {
    "code": "RECIPE_NOT_FOUND",
    "message": "Recette introuvable.",
    "details": []
  }
}
```

404 : ressource ou ingrédient absent ; 422 : paramètres invalides ; 503 :
fichier de catalogue absent/invalide ou base de recettes indisponible.
Les erreurs de connexion, tables absentes et données de recette invalides
utilisent `RECIPES_UNAVAILABLE`, sans détails SQL ni identifiants serveur.
Pour une erreur 422, `details` contient les
champs et messages de validation, sans recopier les valeurs d’entrée.
Un filtre valide sans résultat retourne 200 avec une liste vide. Ces règles
s’appliquent à `/api/v1/` ; les erreurs historiques restent inchangées.

## Quantités et prix

- Les quantités et montants sont des **chaînes décimales**, par exemple
  `"0.970"`, `"150"`, `"2.49"`. Les nombres JSON, virgules, exposants,
  valeurs négatives et valeurs non finies sont refusés par ces contrats.
- Les ingrédients de recette utilisent `g`, `ml` ou `unit`. Les quantités
  sont strictement positives ; `unit` désigne des pièces entières dans
  cette première version. Les portions sont un entier strictement positif.
- Les durées sont des entiers en minutes. Le total est préparation +
  cuisson. Les étapes sont numérotées de 1 à N sans trou ni doublon.
- Une quantité s’applique à la préparation indiquée (sec, pelé, égoutté…).
  La quantité entière de la recette est donnée pour `servings` portions.
- `format.quantity` et `format.unit_raw` conservent le format marchand
  tel que fourni. `basis: source_unspecified` signale que son interprétation
  n’est pas normalisée. Ne pas déduire automatiquement le prix au gramme,
  le poids égoutté ou le nombre de paquets à acheter.
- Le calcul monétaire se fera avec des décimaux exacts côté serveur.
  Aucun total de panier ni prix de recette n’est calculé par cette API.

`price.kind` distingue les quatre natures convenues :

| Nature | Valeurs |
| --- | --- |
| `commercial` | `amount` connu, bornes nulles ; la date et la provenance restent nécessaires |
| `declared` | Même structure monétaire, pour une déclaration après achat |
| `estimated` | `amount: null`, bornes `min_amount` et `max_amount` connues et ordonnées |
| `unknown` | Montant et bornes à `null` |

La devise est CAD. Les JSON commerciaux actuels produisent seulement
`commercial` ou `unknown`. Les autres natures sont définies dans le contrat,
sans implémenter de contribution ni de méthode d’estimation. Un montant zéro
explicite reste distinct d’un montant inconnu. La base du prix reste
`source_unspecified` : taxes, consignes, conditions ou prix par paquet ne
sont pas déduits de ces fichiers.

## Promotions

Une offre est un relevé de prix, même hors promotion. `promotion.declared`
reprend le booléen source ; les dates d’origine restent nulles si inconnues.
Le statut calculé distingue :

- `not_promotion` : la source indique `false` ; `unknown` : indicateur inconnu.
- `upcoming` ou `expired` : une borne connue exclut la date demandée.
- `active` : promotion déclarée et date comprise entre deux bornes connues,
  inclusives.
- `unverifiable` : promotion déclarée mais période insuffisamment documentée.

`promotion_only=true` conserve uniquement `active`. Une liste vide ne prouve
donc pas qu’aucune promotion n’existe en magasin ; elle décrit les données
de la capture. Une période inversée est refusée au chargement.

## Répartition et évolution

- Ensemble : conventions ci-dessus, schémas et modifications de contrat.
- Responsable Recettes : données et parcours recettes, en conservant les
  références `ingredient_id` et les enveloppes partagées.
- Responsable Promos : catalogue, offres et filtres, en conservant les prix,
  provenances et statuts explicites.

Les modèles Python sont la référence exécutable. Les
[exports v1](../contracts/v1/README.md) fournissent JSON Schema, OpenAPI et
exemples aux deux développeurs. Le projet Expo existe ; ses types TypeScript
sont maintenus dans `mobile/types/`. Leur génération depuis OpenAPI reste
une évolution possible.

```bash
python -m backend.cli.export_shared_contracts
python -m backend.cli.export_shared_contracts --check
python -m pytest backend/tests -q
```

Une modification incompatible de nom, type, unité, identifiant ou signification
demande une nouvelle version et l’adaptation des consommateurs. L’intégration
PostgreSQL/Supabase est réalisée pour les recettes partagées et personnelles,
avec leurs ressources publiques conservées et leurs contrats revérifiés.
L’authentification et les droits privés sont intégrés et décrits ci-dessous.


## Comptes et recettes personnelles

Le mobile utilise Supabase Auth, puis envoie `Authorization: Bearer …`.
`/auth/me` vérifie l’identité et `/api/v1/me` expose le profil minimal.
Les écritures rejettent les identifiants de propriétaire fournis par le client.
Une recette personnelle d’un autre utilisateur est masquée par 404. Les
résumés/détails ajoutent `is_owned` et `is_favorite`. Les métadonnées
`dataset_kind` distinguent `demo`, `user_content` et `mixed` ; les recettes
manuelles confirmées n’exigent pas la revue des recettes de démonstration.
Voir [AUTH.md](AUTH.md) pour les corps, droits et codes de réponse.

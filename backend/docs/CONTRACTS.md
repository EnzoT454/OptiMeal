# Contrats communs — Recettes et Promos v1

Les contrats HTTP `1.0` couvrent les lectures et les écritures manuelles de recettes sous `/api/v1`. Ils
sont utilisés par les deux onglets. Les recettes sont lues dans
PostgreSQL/Supabase ; les ingrédients restent sur JSON. Les offres sont lues
sur JSON par défaut ou dans PostgreSQL avec `OFFERS_SOURCE=database`. Les
circulaires utilisent PostgreSQL pour les informations et Storage pour les pages.
Les routes historiques `/catalog` et
`/catalog/offers` conservent leur comportement et leur format.

## Démarrage

Depuis la racine, avec l’environnement Python activé :

```bash
python -m backend.cli.build_common_catalog
python -m alembic -c backend/alembic.ini upgrade head
python -m backend.cli.import_ingredients
python -m backend.cli.import_recipes
python -m backend.cli.import_offers
python -m backend.cli.export_shared_contracts --check
python -m uvicorn backend.app.main:app --reload --port 8001
```

Configurer `DATABASE_URL` côté serveur selon le [guide Supabase](SUPABASE.md),
puis ouvrir `http://localhost:8001/docs`. Les recettes sont relues en base à
chaque requête et ne dépendent plus des fichiers locaux. Une base vide renvoie
une liste vide ; une base inaccessible ou des tables absentes renvoient 503.
Aucun repli sur le JSON ne masque une panne. Le serveur ne lance ni collecte,
ni appel IA, ni migration ou import automatique.

Les ingrédients et les offres en mode JSON utilisent le fichier
`data/catalog/baseCommune/ingredients.json`, configurable avec
`COMMON_CATALOG_PATH` et chargé au démarrage. Un catalogue local invalide
bloque ces lectures et la liste des offres en base, qui vérifie aussi le
référentiel d’ingrédients. Les recettes et les circulaires n’en dépendent pas.
`RECIPE_SEED_PATH` sert
à la commande d’import, sans modifier les recettes exposées tant que cet
import n’a pas eu lieu. La commande d’export valide les fichiers de départ
hors réseau. `/health` reste disponible sans base ni catalogue.

Les recettes utilisent le champ nullable `image_url` pour leurs images
Supabase Storage. Les dix URL initiales sont synchronisées avec le fichier
d’import ; les photos personnelles sont envoyées par le mobile avant
POST/PUT de la recette. À la création, `RecipeCreate` exige une chaîne
`image_url` non vide contenant une URL HTTPS valide ; une omission, `null`,
une chaîne vide ou une URL invalide produit 422 avant création. L’édition
conserve le contrat `RecipeWrite` nullable : le retrait envoie `image_url: null`. Les contrats
HTTP sont inchangés ; les droits et limites Storage sont décrits dans
[RECIPE_IMAGES.md](RECIPE_IMAGES.md).

## Routes et filtres

| Méthode et route | Réponse | Filtres |
| --- | --- | --- |
| `GET /api/v1/ingredients` | Liste du référentiel commun | `q`, `limit`, `offset` |
| `GET /api/v1/recipes` | Recettes publiques et personnelles accessibles | `scope`, `q`, `quick`, `favorites`, `limit`, `offset` |
| `GET /api/v1/recipes/{id}` | Recette complète accessible, avec ingrédients et étapes | — |
| `POST /api/v1/recipes` | Créer une recette personnelle, propriétaire issu du jeton | Connexion requise |
| `PUT /api/v1/recipes/{id}` | Remplacer sa propre recette | Connexion requise |
| `PATCH /api/v1/recipes/{id}/visibility` | Publier ou rendre privée sa propre recette | Connexion requise |
| `DELETE /api/v1/recipes/{id}` | Supprimer sa propre recette | Connexion requise |
| `PUT / DELETE /api/v1/recipes/{id}/favorite` | Ajouter/retirer son favori | Connexion requise |
| `GET /api/v1/offers` | Prix relevés avec produit, format et contexte | `ingredient_id`, `retailer`, `store_id`, `category_id`, `promotion_only`, `on_date`, `limit`, `offset` |
| `GET /api/v1/offers/{id}` | Détail d’un prix relevé | `on_date` |
| `GET /api/v1/circulars` | Circulaires disponibles, dates et liens des pages | Aucun |

Exemples :

```text
/api/v1/recipes?limit=10
/api/v1/recipes/recipe_poulet_riz_brocoli
/api/v1/recipes?quick=true
/api/v1/offers?ingredient_id=ing_tomate_fraiche&retailer=metro
/api/v1/offers?promotion_only=true&on_date=2026-10-06
```

La dernière URL évalue la capture actuellement chargée à une date passée.
Elle ne recherche pas une ancienne version des prix : aucun historique de
prix n’est encore conservé par `product_offer`. Sans
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
Sans jeton, les recettes initiales et les recettes personnelles publiées sont
visibles ; avec un jeton valide, les recettes privées du compte s’ajoutent.
`favorites=true` exige une session. Les droits et routes sont décrits dans
[AUTH.md](AUTH.md).

### Visibilité et sections de recettes — étape backend

La migration `0009_recipe_visibility` est requise. Liste et détail exposent
`visibility` (`private` ou `public`) et `published_at` (horodatage avec fuseau,
nullable). Les dix recettes initiales restent publiques, avec une date de
publication nulle. Les recettes personnelles existantes restent privées.

| `scope` | Résultat |
| --- | --- |
| `accessible` (défaut) | Toutes les recettes publiques et les recettes privées du compte ; compatibilité avec le mobile actuel |
| `discover` | Recettes publiques, y compris celles du compte connecté |
| `mine` | Recettes du compte uniquement, privées et publiques ; 401 sans connexion |
| `favorites` | Favoris accessibles du compte ; 401 sans connexion |

Recherche, Rapides et pagination s’appliquent après les règles d’accès et de
section, y compris pour `total`. L’ancien `favorites=true` reste accepté avec
`scope=accessible` ou `scope=favorites` ; sa combinaison avec `mine` ou
`discover` renvoie 422. Une section inconnue renvoie 422.

`POST /api/v1/recipes` accepte `visibility`, privée par défaut. Une création
publique fixe `published_at` côté serveur. Pour publier ou retirer une recette :

```http
PATCH /api/v1/recipes/recipe_identifiant/visibility
Authorization: Bearer <jeton>
Content-Type: application/json

{"visibility": "public"}
```

La réponse 200 contient le détail sous `item`. Utiliser `private` pour retirer
la publication ; la date redevient nulle. Répéter le même état conserve la date
existante. Une nouvelle publication reçoit une nouvelle date. Les champs
propriétaire et date de publication ne sont pas acceptés dans les écritures.
401 sans session, 404 pour une recette absente, initiale ou appartenant à un
autre compte, 422 pour un état invalide, 503 si la base est indisponible.

Le `PUT` de contenu conserve son contrat actuel et ne change jamais la
visibilité ; utiliser le `PATCH` dédié. Une recette publique d’un autre auteur
reste non modifiable et non supprimable par le lecteur.

Après retrait du public, le détail devient inaccessible aux autres comptes
(404) et leurs favoris masquent la recette. Les associations de favoris sont
conservées : une republication les réaffiche. Retirer son propre favori reste
possible et idempotent même si la recette est devenue inaccessible ; cette
opération ne confirme pas l’existence de la recette. Le calendrier masque
alors nom et photo sans supprimer le repas ; voir [PLANNING.md](PLANNING.md).

Le mobile utilise ces sections depuis le 1er novembre : Découvrir, Mes recettes
et Favoris. Le formulaire propose le partage et le détail les actions de publication
et retrait après confirmation. Le POST transmet la visibilité ; en édition,
le contenu utilise PUT et le statut PATCH. Pour un retrait, PATCH précède PUT ;
pour une publication, PUT précède PATCH. Une erreur entre les requêtes est
signalée comme une sauvegarde partielle par le mobile. Le prototype conserve le
bucket public `recipes-images`, pour toutes les photos de recettes. Une URL
déjà connue reste accessible même après retrait de la publication. Le changement
de visibilité conserve le fichier et son URL. La séparation privé/public du
stockage est reportée après le prototype ; voir [RECIPE_IMAGES.md](RECIPE_IMAGES.md).

## Calendrier

Les routes `/api/v1/plans`, `/api/v1/plans/entries` et
`/api/v1/plans/entries/{id}` sont intégrées et décrites dans l’export OpenAPI.
Elles exigent une connexion et utilisent la table de la migration `0008`.
Le [guide du calendrier](PLANNING.md) détaille lecture par semaine, création,
modification, suppression, repas libres et restes. Le modèle actuel utilise
les recettes courantes ; il ne réalise pas encore l’historique par instantanés.

## Suppression du compte

`DELETE /api/v1/me` exige un jeton valide et le corps
`{"confirmation":"SUPPRIMER"}`. Aucun identifiant de compte n’est accepté :
seul le compte authentifié est supprimé. La réponse est 204 sans corps ; 401
si la session manque, 422 si la confirmation est invalide ou un champ interdit
est fourni, et 503 en cas de panne ou de configuration serveur manquante.

Le nettoyage des photos précède la suppression Auth et les cascades métier.
Ces opérations ne sont pas atomiques : une erreur peut survenir après le retrait
de photos. Voir le [guide Auth](AUTH.md#suppression-définitive-du-compte) pour
la configuration, les données supprimées et les limites. L’export OpenAPI
inclut cette route et son schéma `AccountDelete` ; le mobile retire sa session
locale seulement après une réponse de succès.

## Difficulté et étiquettes des recettes

Les résumés, détails et écritures acceptent les champs additionnels
`difficulty` (`easy`, `medium`, `hard` ou `null`) et `tags` (liste de 10 chaînes
au maximum, chacune de 1 à 40 caractères après retrait des espaces).
À la création, leur omission donne `null` et `[]` ; en PUT, leur omission
conserve les valeurs existantes, pour les anciens clients.
Les doublons sans distinction de casse ou d’accents sont éliminés ;
`économique` devient `Économique`. `Rapide` est retiré des étiquettes stockées :
le mobile calcule ce badge avec le même seuil de 30 minutes que le filtre,
cuisson comprise. Économique est une indication de l’auteur, pas un coût calculé.
Les recettes initiales conservent une difficulté non précisée et aucune
étiquette personnelle. La migration requise est `0004_recipe_metadata`.

## Photos des produits

La liste `GET /api/v1/offers` et le détail `GET /api/v1/offers/{id}`
exposent les mêmes champs additionnels, en lecture JSON et PostgreSQL :

| Champ | Type | Rôle |
| --- | --- | --- |
| `image_url` | chaîne ou `null` | Lien direct de la photo du produit |
| `image_source` | chaîne ou `null` | Provenance de la photo, par exemple `superc` |

Dans les modèles Pydantic, leur omission donne `null`, ce qui permet de lire
les anciens catalogues sans photo. Les réponses sérialisées et le type
TypeScript `Offer` incluent les deux champs. Les exports JSON Schema,
OpenAPI et exemples dans `backend/contracts/v1/` les décrivent également.

L’assembleur du catalogue transforme `ImageUrl` et `ImageSource` des fichiers
marchands en ces noms communs. Il exige un préfixe HTTPS pour un lien
renseigné et refuse le champ `ImageSource` seul sans champ `ImageUrl`.
Les schémas Pydantic déclarent des chaînes nullables, sans validation HTTPS
supplémentaire ; PostgreSQL impose le préfixe HTTPS via la migration `0007`.
Ces contrôles ne prouvent ni la disponibilité du lien ni l’exactitude de la photo.

L’API transmet une URL, sans télécharger ou héberger le fichier. Le mobile
charge l’image directement et affiche une icône de panier en cas d’absence
ou d’erreur. Les champs de photo sont exclus de l’empreinte de l’offre :
modifier uniquement sa photo ou sa provenance conserve l’identifiant public.
Les autres données de la fiche continuent à participer à cette empreinte.

Pour les lectures PostgreSQL, appliquer `0007_product_images` puis importer
le catalogue enrichi ; voir le [guide des migrations](MIGRATIONS.md#photos-des-produits).
Ces photos de produits sont distinctes de `recipe.image_url`, qui référence
les photos de recettes dans Supabase Storage.

## Identifiants partagés

| Identifiant | Convention |
| --- | --- |
| Ingrédient | Clé stable `ing_…` identique dans catalogue et recettes |
| Recette initiale | `recipe_` suivi de son `seed_key`, par exemple `recipe_poulet_riz_brocoli` |
| Produit | Identifiant de fiche qualifié du catalogue commun, par exemple `maxi:8661:21004355001_EA` |
| Enseigne | `maxi`, `metro`, `superc` |
| Succursale API | Identifiant qualifié, par exemple `metro:178` ; le code marchand seul reste dans `external_store_id` |
| Offre | `offer_…`, empreinte de l’ingrédient et de la fiche source ; stable à données identiques ; les champs de photo sont exclus de l’empreinte |

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
vaut 20 par défaut et accepte 1 à 100 ; `offset` est positif ou nul.
`/api/v1/circulars` utilise une enveloppe fixe
avec `limit: 100`, `offset: 0`, sans paramètres de pagination. Un
décalage au-delà de la fin retourne `items: []`. Les recettes sont ordonnées
par identifiant ; les ingrédients et les offres suivent le jeu source.
Un détail utilise
`{"item": …, "meta": …}`. Les recettes initiales portent
`dataset_kind: demo` et un avertissement indiquant leur statut de propositions.
La métadonnée `data_source` vaut `postgresql` pour les recettes et les
circulaires, `local_json` pour les ingrédients, et dépend de `OFFERS_SOURCE`
pour les offres. `review_required` d’une recette reprend
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
fichier de catalogue absent/invalide ou service de données indisponible.
Les offres PostgreSQL et les circulaires utilisent `DATABASE_UNAVAILABLE`
si leur base est inaccessible ; les circulaires exigent aussi `SUPABASE_URL`.
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

Une offre est un relevé de prix, même hors promotion. `price.amount` contient
le prix de base ; `promo_price` contient un objet monétaire si un prix promo
est renseigné, sinon `null`. `retrieved_at` conserve la date de récupération
et `category_id` identifie le rayon lorsqu’il est connu. Le mobile affiche
le prix promo lorsqu’il existe, sinon le prix de base. `promotion.declared`
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

## Circulaires

`GET /api/v1/circulars` renvoie une ligne par magasin importé : `retailer`,
`valid_from`, `valid_to`, `page_count`, `pages` et `imported_at`. `pages`
contient les URL publiques des images JPEG dans l’ordre de lecture.
Les métadonnées restent celles du catalogue source, avec les avertissements
communs ; elles ne certifient pas l’actualité des prix.

Le serveur ne retire pas automatiquement les circulaires expirées. Le mobile
les signale et affiche un emplacement sans circulaire pour un magasin absent.
L’import se lance en ligne de commande et ne publie aucun prix dans les offres.
Voir le [guide backend](../README.md#promos-et-circulaires-de-la-semaine).

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

*Dernière mise à jour : 1er novembre 2026*

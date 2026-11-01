# Migrations et tables applicatives

Alembic est l’unique chaîne de migrations des tables applicatives. Supabase
héberge PostgreSQL ; ne pas créer ces mêmes tables depuis son éditeur SQL
ou une seconde chaîne de migrations Supabase. Les révisions sont versionnées
dans `backend/alembic/versions/` et leur application dans `public.alembic_version`.

## Installer le schéma et charger le référentiel

La tête courante est `0010_preserve_meals`. La révision précédente
`0009_recipe_visibility` ajoute à `recipe` les
champs `visibility` (privée par défaut) et `published_at` (avec fuseau), les
contraintes de publication et un index sur la visibilité. Les recettes
initiales existantes deviennent publiques ; les recettes personnelles
existantes restent privées, sans publication automatique. Aucune recette,
aucun favori ni repas n’est supprimé par cette migration. Le rejeu de l’import
initial reste compatible. Le retour à `0008` retire uniquement ces champs
et leurs contraintes/index ; il perd les choix de publication.

Les contrôles de liste, détail, favoris et calendrier exigent `0009` :
appliquer les migrations avant de redémarrer le backend mis à jour. Les tests
locaux ne prouvent pas son application sur Supabase. Le 1er novembre 2026,
`0009` a également été appliquée sur le projet Supabase configuré : révision
contrôlée, schéma conforme aux modèles et comptages identiques avant/après
pour les neuf tables applicatives. Les 10 recettes initiales sont publiques ;
aucune recette personnelle n’était présente lors de cette application.

Depuis la racine, avec l’environnement Python activé et `DATABASE_URL`
configurée dans `backend/.env` ou dans l’environnement serveur :

```bash
python -m alembic -c backend/alembic.ini upgrade head
python -m backend.cli.import_ingredients
python -m backend.cli.import_ingredients
python -m backend.cli.import_recipes
python -m backend.cli.import_recipes
python -m alembic -c backend/alembic.ini current
python -m alembic -c backend/alembic.ini check
```

La première révision, `0001_ingredients`, crée uniquement `public.ingredient` :

| Colonne | Type et règle |
| --- | --- |
| `id` | `TEXT PRIMARY KEY`, clé canonique `ing_…` conservée |
| `name` | `TEXT NOT NULL`, non vide |
| `category` | `TEXT NOT NULL`, non vide |
| `aliases` | `TEXT[] NOT NULL`, tableau vide par défaut |

Sur une base neuve, le premier import traite et insère 31 ingrédients. Le
second traite les mêmes 31 lignes, en modifie 0 et conserve 31 lignes en base.
La clé primaire empêche les doublons. Un champ modifié dans le fichier source
actualise la ligne portant la même clé ; une ligne absente du fichier n’est
jamais supprimée. Le fichier est donc la référence pour ces quatre champs.
Un échec annule toute la transaction d’import.

La commande valide `data/catalog/baseCommune/ingredients.json` avant toute
connexion. `--input CHEMIN` ou `COMMON_CATALOG_PATH` permet un autre catalogue
de même format. Les 93 fiches produits, leurs prix, leurs références de source
et les 10 recettes ne sont pas importés par la commande d’ingrédients.
Les ingrédients HTTP restent sur JSON. Les recettes lisent PostgreSQL ; les
offres utilisent JSON par défaut ou PostgreSQL avec `OFFERS_SOURCE=database`.
Le démarrage FastAPI ne migre ni n’importe rien.

La migration active RLS sur `ingredient`, sans politique d’accès direct aux
clients Supabase. L’import et les futurs services utilisent la connexion
PostgreSQL serveur configurée, avec un rôle autorisé à accéder à la table.
Les identifiants restent dans `backend/.env`, jamais dans `alembic.ini`.

## Tables des recettes

La révision `0002_recipes`, après `0001_ingredients`, crée deux tables vides :

| Table | Contenu et contraintes |
| --- | --- |
| `recipe` | `id TEXT` au format public `recipe_…`, `seed_key` unique, nom, description, portions positives, durées non négatives et total cohérent, image nullable, étapes JSONB et `review_required` vrai par défaut |
| `recipe_ingredient` | Références textuelles à la recette et à l’ingrédient, position positive unique par recette, quantité exacte `NUMERIC`, unité `g`, `ml` ou `unit`, préparation nullable |

Une recette ne peut référencer deux fois le même ingrédient. Les quantités
sont positives et finies ; les pièces (`unit`) exigent un nombre entier.
La suppression d’une recette supprime ses liens ; un ingrédient encore
utilisé ne peut pas être supprimé. Un index sur `ingredient_id` permet
de retrouver les recettes concernées.

Les étapes sont un tableau JSONB non vide. Leur contenu et leur ordre seront
validés par `RecipeSeedDocument` à l’import ; la contrainte SQL contrôle
seulement le type tableau et sa présence. Les quantités n’ont pas d’échelle
fixe : elles conservent leurs décimales, sans conversion par un flottant.

RLS est activée sur les deux tables, sans politique d’accès direct depuis
les clients Supabase. Les comptes, recettes personnelles et favoris sont
ajoutés par la révision suivante, `0003_accounts`, décrite ci-dessous.
L’import des 10 recettes et les lectures HTTP depuis PostgreSQL sont disponibles.
Les routes `/api/v1/recipes` et `/api/v1/recipes/{id}` requièrent la connexion
serveur. Une base vide produit une liste vide ; une base inaccessible ou des
tables absentes produisent 503, sans repli sur les JSON. Les mises à jour en
base sont visibles dès la prochaine requête. Voir les [contrats](CONTRACTS.md).

Les modèles utilisent le schéma PostgreSQL par défaut `public` implicitement
pour permettre la comparaison des clés étrangères par Alembic ; les migrations
qualifient explicitement leurs tables avec `public`.

## Comptes et propriété

`0003_accounts` ajoute `profile`, `favorite` et `recipe.owner_id` lié au profil
Supabase. `seed_key` devient nullable pour les recettes personnelles ; les
recettes de départ conservent leur clé et leur propriétaire nul. La migration
ne crée pas `auth.users` et conserve les imports existants. Les droits sont
vérifiés côté FastAPI ; RLS reste activée sans accès direct au mobile.
Voir le [guide Auth](AUTH.md) pour le détail et le parcours de vérification.

## Difficulté et étiquettes

`0004_recipe_metadata` ajoute `recipe.difficulty` (`easy`, `medium`, `hard`
ou `null`) et `recipe.tags` (tableau vide par défaut, au plus 10 chaînes).
Les recettes existantes, leurs photos, leurs propriétaires et leurs liens
sont conservés. Aucune difficulté ni étiquette économique n’est inventée pour
les recettes initiales. Appliquer `upgrade head` avant de relancer l’API mise à jour.

Le retour en arrière refuse de supprimer ces colonnes si elles contiennent
des métadonnées. Une ancienne requête PUT qui omet ces nouveaux champs conserve
leurs valeurs. Le badge Rapide est calculé à partir de la durée totale, sans
étiquette stockée. Voir les [contrats](CONTRACTS.md).

## Catégories, offres et circulaires

`0005_catalog_offers` crée `category` et `product_offer`. Une offre stockée
référence un ingrédient, un rayon facultatif et un produit marchand : nom,
enseigne, succursale éventuelle, format, prix de base, prix promo, dates et
provenance. Les montants utilisent `NUMERIC` sans échelle imposée.

Après l’import des ingrédients :

```bash
python -m backend.cli.import_offers
python -m backend.cli.import_offers
```

La commande valide le catalogue commun et ses catégories avant connexion.
Elle importe actuellement 8 catégories et 93 fiches produits dans une
transaction, en conservant leurs identifiants. Un second passage identique
ne modifie aucune offre. Les lignes modifiées sont actualisées ; celles
absentes du fichier ne sont pas supprimées. Les anciennes valeurs ne sont
pas conservées : l’historique des prix reste à développer.

`0006_circulars` crée `circular`, avec une ligne par enseigne : dates de
validité, nombre de pages, préfixe Storage et date d’import. Les images sont
dans le bucket public `circulars`. La commande d’import remplace la circulaire
du magasin ; elle ne conserve pas les anciennes semaines. Voir la
[procédure d’import](../README.md#promos-et-circulaires-de-la-semaine).

RLS est activée sur ces trois tables, sans accès direct depuis le client
mobile. FastAPI les lit avec sa connexion serveur. Les retours en arrière de
`0005` et `0006` suppriment leurs tables et leurs données ; ils ne constituent
pas une procédure de conservation de l’historique.

## Photos des produits

`0007_product_images`, après `0006_circulars`, ajoute deux colonnes à
`public.product_offer` :

| Colonne | Type et règle |
| --- | --- |
| `image_url` | `TEXT NULL`, URL de la photo ; contrainte SQL imposant le préfixe `https://` lorsqu’elle est renseignée |
| `image_source` | `TEXT NULL`, provenance de la photo, par exemple `maxi`, `metro` ou `superc` |

Les lignes existantes sont conservées avec ces champs à `NULL`. La migration
ne télécharge aucune image et ne remplit pas les URL. Depuis la racine,
après configuration du serveur et import initial des ingrédients :

```bash
python -m alembic -c backend/alembic.ini upgrade head
python -m backend.cli.build_common_catalog
python -m backend.cli.import_offers
```

L’assembleur reprend `ImageUrl` et `ImageSource` des fichiers `produits.json`
des trois enseignes et les transforme en `image_url` et `image_source` dans
le catalogue commun. L’import insère ou actualise ces champs ; un rejeu
identique ne modifie aucune ligne. Un catalogue sans photo fournit `NULL` :
son import peut donc aussi retirer un lien précédemment enregistré.

Appliquer `0007` avant les lectures PostgreSQL du code actuel. En lecture
JSON, redémarrer FastAPI après reconstruction du catalogue. Les photos
restent sur les serveurs des magasins, indépendamment des buckets Storage
des recettes et circulaires. Le retour en arrière supprime les deux colonnes
et leurs valeurs, sans supprimer les produits ni leurs prix. Voir les
[contrats des photos de produits](CONTRACTS.md#photos-des-produits).

## Repas planifiés

`0008_meal_plan`, après `0007_product_images`, crée `meal_plan_entry` : UUID,
propriétaire, date, moment du repas, recette ou note, portions et marquage de
restes. À l’origine, les clés étrangères supprimaient les entrées lors de la
suppression du compte ou de la recette référencée. Depuis `0010_preserve_meals`,
la suppression d’une recette conserve le repas et met sa référence à NULL ;
la suppression du compte retire toujours ses propres entrées. RLS est activée ; le mobile passe par
FastAPI. L’historique par instantanés n’est pas encore implémenté.

Appliquer `python -m alembic -c backend/alembic.ini upgrade head` avant les
requêtes Calendrier. Le retour en arrière supprime la table et ses entrées.
L’audit local n’applique aucune migration au projet Supabase distant. Voir le
[guide du calendrier](PLANNING.md) pour les routes, contraintes et limites.

### Conservation après suppression — 0010

`0010_preserve_meals` remplace la cascade de `recipe_id` par `ON DELETE SET NULL`
et adapte les contraintes : une entrée existante sans recette ni note représente
une recette supprimée, y compris pour les restes. La validation HTTP continue
à exiger une recette accessible ou une note à la création. Aucun repas ni
contenu de recette n’est copié ; les droits de lecture sont toujours contrôlés.

La migration a été appliquée sur Supabase le 1er novembre 2026 : schéma conforme
aux modèles, référence SET NULL vérifiée et comptages des neuf tables inchangés,
dont 10 repas conservés. Elle ne reconstitue pas les repas supprimés auparavant.
Un retour à 0009 est refusé tant que des entrées sans recette ni note existent,
pour éviter leur suppression silencieuse. Le rejeu de la migration est sans effet.

## Importer les recettes et rejouer la commande

```bash
python -m backend.cli.import_recipes
```

La commande valide `data/recipes/initial_recipes.json` avant de se connecter,
puis vérifie que tous les ingrédients référencés sont en base. Elle importe
les recettes et leurs liens dans une seule transaction. Les identifiants
publics restent `recipe_` suivi de `seed_key`, et les quantités sont converties
directement des chaînes vers `Decimal`.

Sur une base sans recettes, le premier passage ajoute les 10 recettes et leurs
liens ; le second ajoute 0 recette et reconnaît les 10 comme déjà identiques.
Il n’impose pas de limite de 10 au code. Une recette absente du fichier reste
en base. Les recettes importées gardent `review_required: true`.

Un même identifiant ou `seed_key` avec un contenu différent constitue un
conflit : nom, portions, durées, étapes, statut de revue, ingrédients, ordre,
quantités ou préparation. L’import échoue et annule aussi les ajouts effectués
plus tôt dans ce passage. Il n’écrase aucune correction existante. Modifier
le JSON après son import demande donc de résoudre explicitement ce conflit ;
la commande ne propose pas d’option de remplacement forcé.

`--input CHEMIN` sélectionne un autre fichier au format `recipe-seed-1.0`.
Sans cette option, `RECIPE_SEED_PATH` prévaut sur le chemin par défaut. Les
chemins relatifs partent de la racine du dépôt. Les erreurs de connexion ne
révèlent pas les identifiants PostgreSQL.

## Ajouter une migration à deux

1. Partir de la dernière révision commune et répartir les tables : recettes
   pour un développeur, produits et offres pour l’autre. Les références aux
   ingrédients utiliseront `public.ingredient.id`, en texte.
2. Définir les modèles avec `Base` dans le domaine concerné, puis importer
   leur module dans `backend/alembic/env.py` pour enregistrer les métadonnées.
3. Générer et relire la migration :

   ```bash
   python -m alembic -c backend/alembic.ini revision --autogenerate -m "create recipes"
   python -m alembic -c backend/alembic.ini upgrade head
   python -m alembic -c backend/alembic.ini check
   ```

4. Versionner ensemble modèle, migration et tests. Ne pas modifier une
   révision déjà appliquée : ajouter une nouvelle révision de correction.
   Coordonner l’ordre des migrations lors de l’intégration des branches et
   conserver une seule tête (`python -m alembic -c backend/alembic.ini heads`).

L’autogénération inspecte seulement les tables de `public` enregistrées dans
nos modèles. Elle ignore les tables internes de Supabase et les autres tables
non gérées. Pour supprimer une table applicative, écrire explicitement cette
opération dans une nouvelle migration : le filtre évite les suppressions
automatiques de tables absentes des métadonnées.

`upgrade head --sql` permet de consulter le SQL sans connexion. Un retour
à `base` supprimerait la table et ses données : les tests le vérifient
uniquement dans une base locale jetable.

## Tests

```bash
python -m pytest backend/tests -q
python -m backend.cli.export_shared_contracts --check
```

Les tests ordinaires n’accèdent pas à Supabase. Pour les tests
d’intégration, définir `OPTIMEAL_TEST_DATABASE_URL` vers un PostgreSQL local
jetable dont le nom commence par `optimeal_test_`, puis relancer pytest.
Chaque test annule ses modifications de schéma et ses données. La CI fournit
automatiquement ce PostgreSQL temporaire. Les contrôles couvrent migration,
absence de divergence du modèle, import répété, mise à jour sans suppression,
annulation après échec et préservation des tables non gérées. Les tests des
recettes vérifient aussi les références, les doublons, les contraintes de
quantité et durée, les suppressions et la compatibilité des 10 recettes
initiales avec les tables. Leurs insertions restent dans la base de test.
Les tests de l’import vérifient également le rejeu complet, les ingrédients
manquants, les conflits après modifications et l’annulation des ajouts partiels.

*Dernière mise à jour : 1er novembre 2026*

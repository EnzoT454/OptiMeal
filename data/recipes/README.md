# Premier jeu de recettes

Nous commençons par les onglets Recettes et Promos. Le premier jeu contient
les 31 ingrédients déjà présents dans les catalogues et 10 recettes proposées
pour tester l’affichage, les portions et les liens avec les produits. Les
autres onglets seront répartis plus tard. Le référentiel pourra être élargi
progressivement ; 10 est la taille de ce jeu initial, pas une limite de la base.

## Fichiers

- Le [catalogue commun](../catalog/baseCommune/ingredients.json) réunit les
  31 ingrédients et les produits des trois magasins. Sa
  [correspondance](../catalog/baseCommune/ingredient_mapping.json) reprend les
  clés `ing_…` de la configuration existante dans `backend/config/catalog/`.
- `initial_recipes.json` contient les 10 recettes : nom, description, portions,
  durées en minutes, ingrédients quantifiés et étapes ordonnées.

Ces fichiers alimentent les commandes d’import explicites. Ils ne créent
aucune table à eux seuls.
Les recettes sont maintenant lues dans PostgreSQL par `/api/v1/recipes`
et `/api/v1/recipes/{id}`, selon les [contrats communs](../../backend/docs/CONTRACTS.md).
Le référentiel PostgreSQL `ingredient` et son import sont disponibles. Les
tables `recipe` et `recipe_ingredient` sont définies par la migration
`0002_recipes`. La commande `python -m backend.cli.import_recipes` importe
les 10 recettes sans doublons. Les routes les relisent en base à chaque
requête, indépendamment des fichiers locaux ; voir le
[guide des migrations](../../backend/docs/MIGRATIONS.md).
Les recettes sont des propositions originales produites avec assistance IA,
marquées `review_required`, sans essai en cuisine ni validation humaine.
Les durées sont indicatives et les images restent inconnues (`null`).

## Identité commune des ingrédients

Les `Id` des catalogues ne sont pas interchangeables : `4` désigne la tomate
chez Metro et Super C, mais la banane chez Maxi. Une recette référence donc
une clé commune, par exemple `ing_tomate_fraiche`, qui désigne les lignes
Metro/Super C `4` et Maxi `11`.

Le fichier de correspondance est une proposition explicite fondée sur les
libellés existants. Il ne valide ni les prix, ni les formats, ni l’équivalence
de tous les produits commerciaux. Par exemple, le riz générique Metro/Super C
doit être vérifié avant de le traiter comme du riz basmati blanc. Les alias
ne suffisent pas : Maxi utilise notamment « tomate » à la fois pour le frais
et la conserve.

Chaque ingrédient des recettes appartient à ce référentiel de 31 éléments.
Les masses sont en `g`, les volumes en `ml` et les comptes en `unit`. La
quantité concerne la préparation indiquée : riz et pâtes secs, légumineuses
et thon égouttés, fruits pelés lorsque précisé. Ne pas convertir automatiquement
une masse égouttée en nombre de conserves ni une masse en volume sans référence.
L’eau de cuisson est traitée comme auxiliaire de préparation, hors catalogue
et hors calcul de prix de ce jeu ; aucun autre ingrédient hors référentiel
n’est nécessaire aux propositions.

## Utilisation de Schema.org

[Schema.org/Recipe](https://schema.org/Recipe) fournit un vocabulaire pour
décrire les recettes. Nous en retenons les notions suivantes :

| Champ interne proposé | Propriété Schema.org correspondante |
| --- | --- |
| `name`, `description` | `name`, `description` |
| `servings` | `recipeYield` |
| `prep_time_minutes`, `cook_time_minutes`, `total_time_minutes` | `prepTime`, `cookTime`, `totalTime` |
| `ingredients` | `recipeIngredient` |
| `instructions` | `recipeInstructions`, avec des étapes `HowToStep` |
| `image_url` | `image` |

Le fichier est un format interne proposé, pas du JSON-LD Schema.org. Un
futur export traduira par exemple 25 minutes en `PT25M`. Les ingrédients
restent structurés avec clé, quantité, unité et préparation pour permettre
les calculs ; ils ne sont pas stockés uniquement comme du texte libre.
Schema.org ne fournit pas les recettes de ce jeu et ne définit pas les
tables PostgreSQL, les droits d’accès ou les prix de l’application.

## Modèle minimal PostgreSQL

Trois tables suffisent pour afficher et exploiter ce catalogue initial :

| Table | Contenu minimal |
| --- | --- |
| `ingredient` (implémentée) | `id TEXT PRIMARY KEY` au format `ing_…`, nom, catégorie et alias ; référentiel commun avec Promos |
| `recipe` (implémentée) | Identifiant textuel `recipe_…`, `seed_key` unique, nom, description, portions, durées, image facultative, étapes en JSONB et `review_required` |
| `recipe_ingredient` (implémentée) | Clé composée recette–ingrédient, position unique par recette, quantité `NUMERIC` exacte positive et finie, unité et préparation facultative |

Les clés `ingredient_id` des fichiers sont les identifiants textuels existants.
La table SQL conserve directement ces clés `ing_…` comme clés primaires.
Les clés étrangères de `recipe_ingredient` utilisent donc le même
type texte, sans conversion vers les indices propres aux magasins. La correspondance aux produits reste dans le
domaine catalogue ; aucun prix ni identifiant marchand n’est fixé dans une recette.

Ces premières recettes alimenteront un catalogue de départ commun, en lecture.
Les recettes personnelles sont liées à un propriétaire Supabase Auth et
protégées côté serveur. La migration `0003_accounts` et les routes de
création manuelle, édition, suppression et favoris sont disponibles ; voir
le [guide Auth](../../backend/docs/AUTH.md). Les recettes initiales restent
partagées en lecture et ne peuvent pas être modifiées par ces routes.

L’import est transactionnel et rejouable sans doublons : les clés
stables identifient les ingrédients et `seed_key` les recettes. Une recette
déjà identique est conservée. Un contenu différent provoque un conflit et
l’annulation de tout le passage, sans écraser les modifications existantes.
Le chargement initial porte sur ces 10 recettes, sans contrainte SQL limitant
le nombre futur de recettes ou d’ingrédients.

## Premier parcours à livrer

1. Appliquer la migration commune `ingredient` et son import, déjà disponibles.
   Appliquer `0002_recipes` pour les deux tables.
2. Exécuter `python -m backend.cli.import_recipes` après l’import des ingrédients.
   Relancer la commande : les 10 recettes sont reconnues identiques, sans nouvel ajout.
3. Relier les lectures FastAPI disponibles à l’onglet Recettes avec les états
   vide, chargement et erreur.
4. Relier la recherche et le filtre Rapides disponibles dans l’API ; le seuil
   de cette première version est de 30 minutes, préparation comprise.
5. Relier les ingrédients aux offres du collègue, en conservant les formats,
   dates et correspondances non vérifiables. Ajouter ensuite les favoris,
   l’édition et les modes IA par étapes.

Un premier résultat fonctionnel est : ouvrir l’application, voir les recettes
persistées, consulter leurs ingrédients et leurs étapes, puis les retrouver
après redémarrage du serveur.

# Catalogue commun de départ

`ingredients.json` rassemble les **31 ingrédients et 93 fiches produits**
des catalogues Maxi, Metro et Super C. Il sert de référentiel local commun
aux onglets Recettes et Promos. Les ingrédients sont aussi importables dans
PostgreSQL ; les produits et offres restent à raccorder à la base.

## Générer le fichier

Depuis la racine du projet, avec l’environnement Python activé :

```bash
python -m backend.cli.build_common_catalog
```

La commande lit les trois fichiers `produits.json`, la correspondance
`ingredient_mapping.json` et les trois configurations d’ingrédients indiquées
dans cette correspondance. Elle fonctionne sans réseau ni clé API.
Relancer la commande sur les mêmes entrées produit exactement le même JSON.
Les fichiers sources restent conservés dans leurs dossiers respectifs.

Modifier les sources puis régénérer le fichier, plutôt que de modifier
`ingredients.json` à la main. L’option `--output CHEMIN` permet un autre
emplacement. Les entrées sont repérées par rapport à la racine du dépôt.

## Identifiants

- `ingredients[].id` est la clé commune stable, par exemple
  `ing_tomate_fraiche`. Les recettes utilisent cette même clé.
- `sources[].ingredient_id` conserve l’ancien identifiant, propre au
  fichier de l’enseigne. Pour la tomate : Metro/Super C `4`, Maxi `11`.
- `products[].external_product_id` conserve l’identifiant marchand en texte,
  avec ses éventuels zéros initiaux.
- `products[].id` identifie une fiche par enseigne, succursale et identifiant
  marchand : `maxi:8661:21004355001_EA`, par exemple. Les composantes sont
  encodées pour éviter les collisions de séparateurs. Ce n’est pas une preuve
  qu’un produit de deux enseignes correspond au même article commercial.

La correspondance a été déplacée de `data/recipes/` vers ce dossier pour
être partagée avec Promos. Les références du jeu de recettes ont été adaptées.

## Contenu

Chaque ingrédient contient son nom commun, sa catégorie, les alias réunis
des sources, les références aux lignes d’origine et les fiches produits.
Les alias peuvent rester ambigus : « tomate » figure dans le frais et la
conserve ; ils ne doivent pas servir seuls à fusionner des ingrédients.

| Champ produit | Champ d’origine / sens |
| --- | --- |
| `retailer`, `store_id` | Enseigne du fichier et `Id_magasin` de la succursale |
| `external_product_id`, `name` | `Id`, `Description` |
| `price`, `currency` | `Prix`, exprimé en CAD selon les conventions du projet |
| `quantity`, `unit` | `Quantité`, `Unité`, conservées sans conversion |
| `valid_from`, `valid_to` | `DateDebut`, `DateFin` |
| `is_promotion` | `IsPromotion` ; un prix inférieur à une autre source ne crée pas une promotion |
| `source`, `url` | `Source`, `Url` |

Prix et quantités sont sérialisés comme chaînes décimales exactes, par
exemple `"1.99"`. Les valeurs inconnues restent `null`. Les unités et leur
signification d’origine sont conservées : ce regroupement ne transforme pas
une quantité de paquet en poids égoutté, et ne convertit pas les masses en volumes.

`inputs` conserve les chemins et empreintes SHA-256 des entrées pour identifier
le jeu regroupé. Aucune date de récupération ou validité absente n’est inventée.
`status: assembled_from_local_sources` décrit uniquement l’assemblage.
`mapping_status: proposed` conserve le statut de la correspondance : les
différences entre noms génériques et spécifiques restent à vérifier, ainsi
que les données Metro/Super C. La validation Maxi déjà consignée reste
distincte ; le regroupement ne valide pas de nouveaux prix ni leur actualité.

## Ajouter des ingrédients ou des produits

Pour un produit supplémentaire, compléter `Produits` dans la source et
régénérer. Pour un nouvel ingrédient, compléter les configurations, les
sources et la correspondance commune. Le générateur refuse les identifiants
dupliqués, les lignes renommées ou non reliées et les nouveaux champs produit
non pris en charge, plutôt que d’ignorer des données. Il n’impose pas de limite
de 31 ingrédients au code.

Ce format est `common-catalog-1.0`. Les routes `/api/v1/ingredients` et
`/api/v1/offers` le chargent maintenant en lecture, avec validation Pydantic.
Voir les [contrats communs](../../../backend/docs/CONTRACTS.md).
`CATALOG_IMPORT_PATH` reste réservé aux exports historiques `catalog-pilot-1.0` ;
`COMMON_CATALOG_PATH` permet de choisir un autre catalogue commun.
La table PostgreSQL `ingredient` et son import rejouable sont disponibles :
`python -m backend.cli.import_ingredients`, après application des migrations.
Seuls `id`, `name`, `category` et `aliases` sont importés. Voir le
[guide des migrations](../../../backend/docs/MIGRATIONS.md). La persistance
des produits et offres et le raccordement des routes restent à développer.

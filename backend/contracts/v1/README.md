# Exports des contrats v1

Le [guide des contrats communs](../../docs/CONTRACTS.md) décrit les routes,
conventions et responsabilités. Ces fichiers sont générés depuis les modèles
Pydantic et l’application FastAPI ; ne pas modifier les JSON à la main.

Les fichiers `shopping-*.schema.json` et `shopping-list-examples.json` fixent
les [contrats du lot A des listes](../../docs/SHOPPING_LISTS_CONTRACTS.md).
Ils sont testés et consommés par le mobile ; les routes privées de listes
apparaissent dans `openapi.json`. Les schémas `shopping-list-pin-*` ajoutent la préférence privée d’Accueil.
Le filtre `start_date`/`end_date` recherche une période exacte avant pagination.
La migration `0021_shopping_list_pin` est requise pour l’épinglage ; voir
[les accès unifiés](../../docs/SHOPPING_ACCESS.md).

- `sale-reviews.schema.json` et `sale-normalization-report.schema.json` :
  attestations et rapports serveur de [normalisation des ventes](../../docs/SALE_NORMALIZATION.md),
  distincts des routes publiques de Promos.
- `openapi.json` : description des routes et des ressources pour les clients.
- `*-page.schema.json` et `*-detail.schema.json` : schémas JSON des réponses v1.
- `error.schema.json` : erreur partagée.
- `common-catalog.schema.json` et `recipe-seed.schema.json` : formats validés
  des fichiers de départ.
- `recipe-rating-write.schema.json` : trois notes entières obligatoires de
  1 à 5 et `recipe_version`, entier positif égal à `content_version` consultée ;
  les moyennes et notes personnelles figurent dans les schémas Recettes.
- `examples.json` : exemples validés de listes, détails et erreur 404.

Les moyennes de notation sont des chaînes décimales ou null. Le détail expose
uniquement la note personnelle du compte connecté dans `my_rating`, jamais
celles des autres comptes. Les exemples de recettes sans évaluation ont un
effectif nul ; un exemple séparé illustre le corps d’écriture d’une note.
Une ancienne note personnelle reste identifiable par son `recipe_version` ;
elle ne compte pas dans les moyennes de la version courante. Un conflit de
version renvoie 409 et nécessite une nouvelle lecture avant de noter.

Les exemples d’offres sont évalués au **6 octobre 2026** pour être
reproductibles. Ils ne décrivent pas les promotions d’aujourd’hui. Les
recettes sont des propositions de démonstration à vérifier.
Leurs exemples indiquent `data_source: postgresql`, comme les routes réelles.
La génération des exemples utilise les fichiers sources et ne contacte pas
la base. Le booléen `review_required` d’une recette reflète son statut en base.

Depuis la racine, avec l’environnement Python activé :

```bash
python -m backend.cli.export_shared_contracts
python -m backend.cli.export_shared_contracts --check
```

L’option `--check` valide aussi le catalogue commun, les recettes et leurs
références, puis signale les exports absents ou différents sans les réécrire.

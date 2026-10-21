# Exports des contrats v1

Le [guide des contrats communs](../../docs/CONTRACTS.md) décrit les routes,
conventions et responsabilités. Ces fichiers sont générés depuis les modèles
Pydantic et l’application FastAPI ; ne pas modifier les JSON à la main.

- `openapi.json` : description des routes et des ressources pour les clients.
- `*-page.schema.json` et `*-detail.schema.json` : schémas JSON des réponses v1.
- `error.schema.json` : erreur partagée.
- `common-catalog.schema.json` et `recipe-seed.schema.json` : formats validés
  des fichiers de départ.
- `examples.json` : exemples validés de listes, détails et erreur 404.

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

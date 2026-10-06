# Données locales OptiMeal

Le [guide des données](../backend/docs/DATA.md) explique la structure, chaque type de fichier et les commandes à utiliser.

```text
data/
├── catalog/maxi/       # Collectes Apify, rapports, sélections et synthèse
│   └── data_final/
│       ├── README.md      # Format commun et validation des données Maxi
│       ├── produits.json  # Les 31 produits sélectionnés dans les trois lots
│       └── promos.json    # Les 196 offres de la collecte par rayons alimentaires
├── catalog/superc/
├── catalog/maxi/archives/data_final-before-common-format/ # Ancien format complet et validation
│   └── produits.json   # Les 31 ingrédients et leurs produits Super C
├── message.txt         # Fichier source fourni pour les données Super C
├── receipts/
│   ├── images/         # Photos originales
│   ├── extractions/    # Résultats structurés Vision, Tesseract et rejeux
│   ├── ocr/            # Blocs OCR bruts pour le rejeu
│   ├── archives/       # Diagnostics antérieurs
│   └── receipt.schema.json
└── archives/
    ├── circulaires/    # PDF sources de la piste abandonnée
    └── epiceries/      # Anciennes études et collectes épiceries.ca
```

Pour une collecte, commencer par `report.md`. `raw.json` est la capture source ; `catalog.json` est l’export pour FastAPI. Les nouvelles collectes demandent une vérification ; les données Maxi retenues dans `data_final/` ont déjà été revues et vérifiées par Hamza.

Les deux fichiers de `catalog/maxi/data_final/` utilisent maintenant le même tableau et les mêmes attributs que Super C : `Id`, `NomProduit`, `Categorie`, `alias`, `Produits`. Ils conservent les 31 références et les 196 promotions, leurs prix et la succursale `8661`, avec `Source: apify`. Les dates et quantités inconnues restent `null`. La validation de Hamza du 4 octobre 2026 et les détails techniques sont conservés dans `catalog/maxi/archives/data_final-before-common-format/`. Le [guide du format commun](catalog/maxi/data_final/README.md) explique les correspondances.

Les données Super C sont dans `catalog/superc/produits.json`, mises en forme à partir de `message.txt` sans changer les valeurs. Le tableau contient 31 ingrédients avec leur catégorie, leurs alias et leurs produits : identifiant, description, magasin `605`, prix, unité, quantité, dates, promotion et URL. Les noms de champs d’origine sont conservés. Aucune validation humaine des données Super C n’a encore été consignée ; la validation Maxi ne s’y applique pas.

Pour un reçu, consulter `source.filename` et `source.engine` dans le JSON pour retrouver l’image et le moteur. La présence d’un fichier ne signifie pas que ses prix ont été confirmés.

Ce dossier n’est pas ignoré par Git et peut être versionné. Les reçus et leur texte OCR peuvent contenir des informations privées : vérifier et masquer ces informations avant de les publier.

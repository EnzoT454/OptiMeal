# Données locales OptiMeal

Le [guide des données](../backend/docs/DATA.md) explique la structure, chaque type de fichier et les commandes à utiliser.

```text
data/
├── catalog/maxi/       # Collectes Apify, rapports, sélections et synthèse
│   └── data_final/
│       ├── produits.json  # Les 31 produits sélectionnés dans les trois lots
│       └── promos.json    # Les 196 offres de la collecte par rayons alimentaires
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

Les deux fichiers de `catalog/maxi/data_final/` regroupent les données pour les consulter facilement. Chaque entrée de `items` conserve le produit et son offre, avec prix, format, dates et source. `produits.json` reprend les sélections des trois lots ; `promos.json` reprend les offres de `maxi-food-promos-01`. Les collectes originales restent conservées. Les fichiers finaux portent `status: reviewed_and_verified` et `human_validation` (Hamza, 4 octobre 2026, produits, prix et succursale). Les offres ont `review_required: false` ; les dates et conditions inconnues restent à compléter.

Pour un reçu, consulter `source.filename` et `source.engine` dans le JSON pour retrouver l’image et le moteur. La présence d’un fichier ne signifie pas que ses prix ont été confirmés.

Ce dossier n’est pas ignoré par Git et peut être versionné. Les reçus et leur texte OCR peuvent contenir des informations privées : vérifier et masquer ces informations avant de les publier.

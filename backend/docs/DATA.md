# Données locales

Le dossier `data/` contient les fichiers utilisés pour les essais : captures Apify, images de reçus et résultats OCR. Il n’est pas ignoré par Git : les fichiers ajoutés et commités seront disponibles dans une nouvelle copie du dépôt. Vérifier et masquer les informations privées des reçus et du texte OCR avant publication.

La configuration des collectes et le code restent dans `backend/`. Les anciennes pistes sont regroupées dans `archives/`. Les chemins s’utilisent depuis la racine du projet.

## Structure

```text
data/
├── README.md                       # Repère local vers ce guide
├── message.txt                     # Données Super C fournies, source conservée
├── catalog/
│   ├── superc/
│   │   └── produits.json           # Les 31 ingrédients et leurs produits Super C
│   └── maxi/
│       ├── data_final/
│       │   ├── README.md            # Format commun et validation humaine
│       │   ├── produits.json        # Les 31 références sélectionnées dans les trois lots
│       │   └── promos.json          # Les 196 offres promotionnelles par rayon alimentaire
│       ├── archives/data_final-before-common-format/ # Ancien format complet et validation
│       ├── maxi-apify-01/           # Première capture, limitée à la recherche garlic
│       ├── maxi-apify-01-reviewed/  # Rejeu avec règles lexicales corrigées
│       ├── maxi-apify-02/           # Premier lot de dix ingrédients, recherches réparties
│       ├── maxi-apify-batch2-01/    # Deuxième lot de dix ingrédients
│       ├── maxi-apify-batch3-01/    # Troisième lot de onze ingrédients
│       ├── maxi-promos-01/         # Promotions recherchées pour les 31 ingrédients
│       ├── maxi-food-promos-01/    # Promotions recherchées par rayon alimentaire
│       └── synthese/
│           └── optimeal_produits_promos.md  # Tableau de travail, sélection à vérifier
├── receipts/
│   ├── images/                     # Photos originales des six reçus
│   ├── extractions/                # Articles et montants structurés en JSON
│   ├── ocr/                        # Blocs de texte OCR pour rejouer le parsing
│   ├── archives/                   # Anciennes sorties de diagnostic « before »
│   └── receipt.schema.json         # Schéma de la structure JSON d’un reçu
└── archives/
    ├── README.md                   # Signification des essais abandonnés
    ├── circulaires/                # Les trois PDF sources conservés
    └── epiceries/
        ├── analysis/               # Ancienne exploration API, scripts et réponses
        └── collectes/              # Quatre anciens imports/rejeux épiceries.ca
```

Un premier jeu de données Super C fourni est maintenant disponible. Metro n’a pas encore de jeu de données dans `catalog/`. Le pipeline de collecte web IA n’est pas encore intégré au backend.

## Données Super C

`data/catalog/superc/produits.json` reprend le tableau de `data/message.txt` : 31 ingrédients avec catégorie, alias et produits associés à la succursale `605`. Les champs et valeurs d’origine sont conservés, notamment les identifiants sous forme de texte, les prix, unités, quantités, dates, indicateurs de promotion et URL. `DateFin: null` reste une date inconnue ; aucune date n’est inventée.

Ce fichier est une mise en forme des données fournies, pas une vérification des prix ni une collecte lancée par le backend. Aucune confirmation humaine Super C n’a encore été consignée. Ce format n’est pas directement compatible avec les exports `catalog-pilot-1.0` chargés par FastAPI ; une adaptation sera nécessaire pour l’intégration.

## Fichiers d’une collecte Maxi

Pour consulter les données regroupées, utiliser `data/catalog/maxi/data_final/produits.json` (31 références) et `promos.json` (196 offres). Les deux fichiers utilisent exactement les attributs de Super C, avec une liste de produits dans `Produits`. Les prix sont conservés ; les dates et quantités inconnues restent nulles. La validation humaine de Hamza du 4 octobre 2026 et tous les détails du format précédent sont conservés dans `data/catalog/maxi/archives/data_final-before-common-format/`. Le [guide du format commun](../../data/catalog/maxi/data_final/README.md) détaille les correspondances. FastAPI continue à charger les exports sources `catalog-pilot-1.0`, pas ces tableaux simplifiés.

Chaque dossier correspond à une exécution ou à un rejeu. Commencer par `report.md` pour comprendre le résultat.

| Fichier | Utilité |
| --- | --- |
| `raw.json` | Réponses originales, paramètres, identifiants de runs et état de collecte. Sert au diagnostic, à la reprise et au rejeu sans réseau. |
| `catalog.json` | Données normalisées : ingrédients, produits, formats, prix, correspondances et couverture. C’est ce fichier que FastAPI peut charger. |
| `review.json` | Correspondances proposées et rejets à examiner. Le modifier ne confirme pas automatiquement les produits ou les prix. |
| `report.md` | Bilan lisible des candidats, prix, limites et erreurs. |
| `selected_items.json` | Présent dans les trois collectes par lot : sélection de travail conservée séparément de l’export complet. |
| `verification.md` | Présent dans la première collecte : audit de sa couverture et de ses correspondances. |

`maxi-apify-01-reviewed` indique un retraitement des règles, pas une confirmation des prix en magasin. Aucun nom de dossier ne prouve une validation commerciale. La synthèse contient des candidats à vérifier, dont certaines préparations ne correspondent pas à l’ingrédient demandé.

Exemple pour lire le deuxième lot dans FastAPI :

```bash
export CATALOG_IMPORT_PATH=data/catalog/maxi/maxi-apify-batch2-01/catalog.json
python -m uvicorn backend.app.main:app --reload --port 8001
```

Exemple de rejeu de la première capture, dans un nouveau dossier :

```bash
python -m backend.cli.ingest_catalog \
  --replay data/catalog/maxi/maxi-apify-01/raw.json \
  --output-dir data/catalog/maxi/maxi-apify-01-replay
```

Les guides [Apify](APIFY.md) et [catalogue](CATALOG.md) expliquent les commandes et les limites.

## Images et résultats de reçus

Les images gardent leur nom original pour retrouver les résultats correspondants.

| Image dans `receipts/images/` | Usage documenté |
| --- | --- |
| `recu-h1.jpg` | Reçu Maxi : comparaison Vision/Tesseract et lecture des quantités. |
| `recu_maxi.jpg` | Autre reçu Maxi : extraction et rejeu OCR. |
| `recu_metro.png` | Reçu Metro avec rabais membre : cas de correction ciblée sous Tesseract. |
| `recu_2.png` | Autre reçu Metro : comparaison des moteurs. |
| `recu-nouh.png`, `recu-nouh2.png` | Reçus d’essai supplémentaires, profils génériques et extractions partielles. |

Dans `receipts/extractions/`, les anciens noms sont conservés. Le champ `source.filename` donne l’image et `source.engine` indique le moteur réellement utilisé.

| Noms de fichiers | Contenu |
| --- | --- |
| `recu-2-t.json`, `recu-h1-t.json`, `recu-maxi-t.json` | Résultats Tesseract ; le dernier utilise le recadrage. |
| `recu-2-vision-test.json`, `recu-h1-vision-test.json`, `recu-maxi-vision.json` | Résultats Apple Vision pour comparer les moteurs. |
| `recu-h1.json`, `recu_2.json` | Autres sorties Vision conservées. |
| `recu-nouh.json`, `recu-nouh2.json` | Résultats Vision des reçus génériques. |
| `recu_maxi.json`, `recu_metro.json` | Rejeux à partir de blocs OCR sauvegardés. Ce ne sont pas de nouvelles lectures d’image. |

`receipts/ocr/` contient `recu_maxi.ocr.json`, `recu_metro.ocr.json` et `recu_2.ocr.json` : du texte et des positions, avant reconstruction des articles. Les fichiers `nouh-before*` et `nouh2-before*` sont isolés dans `receipts/archives/` pour conserver les diagnostics antérieurs.

La validation humaine du 4 octobre concerne les prix de l’échantillon Maxi/Metro, pas tous les JSON historiques. Certaines sorties conservent des erreurs, notamment le rabais Metro sous Vision. Consulter le [guide OCR](RECEIPTS.md#validation-humaine-des-prix--4-octobre-2026) avant de choisir un résultat de référence.

Pour une nouvelle extraction, utiliser un nom explicite :

```bash
python -m backend.cli.extract_receipt data/receipts/images/recu_maxi.jpg \
  --engine tesseract \
  --save-ocr data/receipts/ocr/recu_maxi.nouveau.tesseract.ocr.json \
  --output data/receipts/extractions/recu_maxi.nouveau.tesseract.json
```

Les reçus et blocs OCR sont privés : ils peuvent contenir des renseignements personnels ou de paiement.

## Archives et nouveaux fichiers

Les circulaires PDF et l’exploration épiceries.ca témoignent des essais précédents. Ces sources sont abandonnées ; leurs résultats ne doivent pas être chargés comme catalogue courant. Les données extraites des circulaires ont déjà été retirées ; seuls les PDF sources sont conservés ici.

Créer un nouveau dossier par collecte, plutôt que remplacer une capture existante. Pour les nouveaux reçus, utiliser le nom de l’image et le moteur dans les sorties, par exemple `recu_maxi.vision.json` ou `recu_maxi.tesseract.json`.

La réorganisation conserve le contenu des fichiers. Des notes historiques et métadonnées peuvent encore mentionner les anciens chemins ; l’arborescence de ce guide fait référence pour leur emplacement actuel.

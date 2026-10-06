# Connecteur Apify pour Maxi

Le connecteur `sunny_eternity/loblaws-grocery-scraper` est intégré au pipeline catalogue et à FastAPI. Il utilise `httpx`, déjà installé ; aucun SDK ni modèle IA supplémentaire n’est requis. L’intégration a été testée avec des réponses simulées. La première collecte réelle a retourné 100 résultats, tous issus de la recherche garlic, pour Maxi Montréal Côte-des-Neiges (8661). Le découpage par ingrédient est testé sans réseau. Hamza confirme que les données Maxi récupérées ont été vérifiées : les produits, les prix et la succursale sont corrects.

## Configuration et collecte

Définir `APIFY_TOKEN` dans l’environnement local, sans le placer dans Git ou dans les arguments de commande. Le CLI ne charge pas automatiquement un fichier `.env`. Le token est envoyé dans l’en-tête `Authorization` uniquement ; il n’est pas enregistré dans les captures.

La liste commune est `config/catalog/ingredients.json`. Les recherches Apify sont définies dans `config/catalog/apify_queries.json`. Les règles comportent des alias et exclusions français et anglais. Le connecteur Apify accepte de 1 à 100 ingrédients distincts, à condition d’ajouter la requête correspondante.

Depuis la racine du dépôt, après avoir défini le token :

```sh
.venv/bin/python -m backend.cli.ingest_catalog --source apify --live \
  --location-id ID_SUCCURSALE_VERIFIE \
  --max-items 100 --max-charge-usd 1 \
  --output-dir data/catalog/maxi/maxi-apify-01
```

`ID_SUCCURSALE_VERIFIE` est un texte à remplacer. Le numéro `8661` est maintenant configuré dans `target_store.json` : les 100 lignes de la première capture Apify déclarent cet identifiant pour Maxi Montréal Côte-des-Neiges. Cette provenance est documentée et ne constitue pas une vérification indépendante des prix.

Pour découvrir la succursale la plus proche, remplacer `--location-id` par `--postal-code CODE_POSTAL`. Examiner ensuite les champs `location`, `location_name`, `location_postal_code` et `location_coordinates` dans `raw.json`. Un code postal ne garantit pas Maxi Côte-des-Neiges. Un identifiant explicite ou déjà configuré a priorité sur le code postal.

Chaque lancement réserve **un run par ingrédient**, exécuté séquentiellement. `--max-items` est le quota global réparti entre les ingrédients : 100 pour dix ingrédients réserve dix résultats par recherche. `--max-charge-usd` est également réparti : 1 USD réserve au plus 0,10 USD de plafond demandé par run, et non 1 USD par run. Les reliquats de quota ne sont pas transférés automatiquement. Un quota inférieur au nombre d’ingrédients est refusé. Le client transmet un délai serveur de 300 secondes, `maxItems` et `maxTotalChargeUsd` à Apify, puis consulte son état et lit le dataset par pages. Ces limites dépendent de leur application par Apify et du modèle de facturation de l’Actor ; ce ne sont pas des promesses de couverture ou de coût exact. Le téléchargement respecte le quota propre à chaque recherche. Atteindre cette limite est signalé comme une possible troncature.

Les variantes restent séparées et les recherches ne se limitent pas aux promotions. Apify est la source par défaut de la commande ; `--source apify` reste accepté.

## Archives, interruption et rejeu

Les quatre sorties restent `raw.json`, `catalog.json`, `review.json` et `report.md`. Les anciennes collectes ne sont jamais écrasées. Le token n’y figure pas.

L’identifiant du run est sauvegardé dès réception ; chaque page du dataset est conservée avant normalisation. Pour reprendre la lecture d’un run existant :

```sh
.venv/bin/python -m backend.cli.ingest_catalog \
  --resume data/catalog/maxi/maxi-apify-01/raw.json \
  --output-dir data/catalog/maxi/maxi-apify-reprise
```

Pour les nouveaux plans par ingrédient, la reprise requiert le token, ignore les recherches achevées, lit les runs déjà identifiés et **lance les recherches prévues qui n’ont pas encore commencé**, dans leurs budgets réservés. Elle peut donc occasionner les frais de ces recherches restantes. Pour les anciennes captures mono-run, elle lit uniquement le run existant. Elle ne ressuscite pas un run `FAILED`, `TIMED-OUT` ou `ABORTED`. Le POST initial n’est jamais retenté automatiquement : en cas de perte réseau avant réception de l’identifiant, vérifier la console Apify avant toute nouvelle collecte. Interrompre le CLI ne stoppe pas le run distant ; celui-ci reste soumis à son délai serveur.

Pour rejouer une capture, même partielle, sans token ni réseau :

```sh
.venv/bin/python -m backend.cli.ingest_catalog \
  --replay data/catalog/maxi/maxi-apify-01/raw.json \
  --output-dir data/catalog/maxi/maxi-apify-rejeu
```

Les nouveaux plans portent la version `apify-batch-1.0` et embarquent une capture `apify-capture-1.0` par recherche. Les anciennes captures restent lisibles. Le CLI détecte automatiquement leur source en reprise/rejeu et utilise leur configuration historique. Les options de collecte ne remplacent pas cette configuration. Une erreur réseau fait sortir avec le code 1 et conserve `raw.json` ; un rejeu partiel peut produire les exports avec code 2. Un code 0 ne constitue pas une approbation commerciale.

## Raccordement à FastAPI

Choisir explicitement le catalogue à servir :

```sh
export CATALOG_IMPORT_PATH=data/catalog/maxi/maxi-apify-01/catalog.json
.venv/bin/python -m uvicorn backend.app.main:app --reload
```

- `GET /catalog` : export complet validé par Pydantic.
- `GET /catalog/offers?ingredient_id=ing_ail_frais&limit=20&offset=0` : prix et produits liés aux suggestions de cet ingrédient, avec pagination et total.
- Sans fichier configuré : HTTP 503. Ingrédient inconnu : 404. Pagination invalide : 422.

Le catalogue est chargé au démarrage ; redémarrer le serveur après avoir choisi une nouvelle collecte. Un fichier invalide empêche le démarrage. Les lectures HTTP ne déclenchent aucun scraping ni dépense Apify. Les anciennes routes épiceries.ca ont été retirées. Aucun consommateur mobile n’est encore implémenté pour ces nouvelles routes. Le stockage PostgreSQL et la fusion de plusieurs collectes restent à faire.

## Sens des données

Les captures Apify produisent le contrat `CatalogExport`. Les offres identifient explicitement leur source :

| Champ | Sens |
| --- | --- |
| `source_name` | `apify_loblaws` |
| `external_store_id` | Identifiant de succursale déclaré par Apify |
| `scope_kind` | `source_reported_store` si un identifiant est fourni, sinon `unknown` |
| `store_id` | Reste nul : aucune association approuvée à notre succursale interne |
| `source_unit_price` | Texte de prix unitaire du fournisseur, sans conversion implicite |
| `multi_buy_deal` / `loyalty_offer` | Conditions brutes, sans calcul automatique de remise |

Une mauvaise enseigne, une succursale différente de l’identifiant demandé ou un prix invalide sont exclus des offres et signalés dans `collection.errors`. Les réponses brutes restent conservées. Les doublons identiques sont dédupliqués. Les produits ne sont pas fusionnés par simple similarité de nom.

Les produits vendus au poids n’obtiennent pas de quantité fixe à partir du poids éventuellement estimé par le scraper. La base de facturation reste `unknown` et les prix unitaires sont conservés comme texte à vérifier. Les autres champs, dont ancien prix et informations détaillées de localisation, restent consultables dans la capture brute.

Pour Apify, `observed_at` et `retrieved_at` représentent l’instant local du début du téléchargement après succès du run, pas une date de publication du marchand. Les offres restent `review_required: true`, `eligible_for_optimizer: false` et sans période de validité inventée. Le compteur automatique de prix vérifiés reste à zéro dans les exports historiques : le code ne sait pas encore enregistrer la validation humaine consignée ci-dessous.

## Validation humaine des données Maxi — 4 octobre 2026

Hamza confirme que les données Maxi récupérées par Apify ont été vérifiées et sont correctes pour les produits, les prix et la succursale Maxi Côte-des-Neiges (`8661`). La validation est consignée le 4 octobre 2026 et couvre les données retenues, dont les 31 produits et les promotions regroupés dans `data/catalog/maxi/data_final/`.

Les captures historiques restent conservées. Les fichiers de `data_final/` utilisent maintenant le même format simplifié que Super C, sans attribut supplémentaire de validation. Les versions précédentes, leur statut `reviewed_and_verified` et leur section `human_validation` sont conservés dans `data/catalog/maxi/archives/data_final-before-common-format/`. La confirmation de Hamza reste valable pour les données retenues. Les dates et conditions inconnues ne sont pas inventées ; l’intégration applicative et en base reste à développer.

## Sources et validation

- [Actor et contrat des données](https://apify.com/sunny_eternity/loblaws-grocery-scraper)
- [Démarrer un run Apify](https://docs.apify.com/api/v2/actors-runs-post)
- [Lire un dataset paginé](https://docs.apify.com/api/v2/dataset-items-get)

Les tests dans `tests/test_apify_catalog.py` simulent collecte, pagination, erreurs, reprise, rejeu et lecture FastAPI. Les collectes réelles nécessitent un token local et une sélection de succursale. La vérification humaine des données Maxi récupérées est maintenant confirmée par Hamza.

## Revoir les correspondances sans nouvelle collecte

Le rejeu conserve normalement les règles archivées. Pour appliquer explicitement les règles actuelles aux anciennes données :

```sh
.venv/bin/python -m backend.cli.ingest_catalog \
  --replay data/catalog/maxi/maxi-apify-01/raw.json --refresh-rules \
  --output-dir data/catalog/maxi/maxi-apify-revision
```

Les règles précédentes sont conservées dans `previous_ingredient_rules` et les identifiants ingrédients doivent rester identiques. Aucune requête réseau n'est envoyée. Le premier audit corrigé est conservé dans `data/catalog/maxi/maxi-apify-01-reviewed/` : sept candidats ail frais, aucun candidat huile d'olive, et toujours 100 observations brutes. Une observation rejetée comme correspondance n'est pas effacée du catalogue ; utiliser le filtre `ingredient_id` de `/catalog/offers` pour lire les offres des candidats proposés.

Le rapport présente désormais les lignes reçues par recherche et les quotas. Une recherche effectuée, une référence proposée et un prix vérifié sont trois mesures distinctes. Les exclusions lexicales restent une première sélection, sans garantie universelle de correspondance.

## Deuxième lot — dix ingrédients suivants

Les fichiers `config/catalog/batch2/ingredients.json` et `config/catalog/batch2/apify_queries.json` définissent le deuxième lot de la liste retenue : tomate, pomme de terre, poivron, brocoli, courgette, pomme, citron, bœuf haché, saumon et thon en conserve. Les légumes et fruits sont recherchés frais ; le bœuf haché est recherché cru, le saumon nature. Les variétés, marques, formats et éventuel état frais/surgelé du saumon restent à examiner lors de la sélection manuelle.

```sh
.venv/bin/python -m backend.cli.ingest_catalog --source apify --live \
  --batch 2 --location-id 8661 --max-items 100 --max-charge-usd 1 \
  --output-dir data/catalog/maxi/maxi-apify-batch2-01
```

Le token doit être exporté dans le terminal qui lance la commande. Ce lot réserve dix résultats par ingrédient et un plafond demandé de 0,10 USD par run. Les sorties sont séparées du premier lot et aucune sélection manuelle n'est automatiquement appliquée. `--batch 1` reste la valeur par défaut. Le rejeu et la reprise lisent le lot archivé ; pour un rejeu du deuxième lot avec de nouvelles règles, préciser `--batch 2 --refresh-rules`.

## Troisième lot — onze derniers ingrédients

`config/catalog/batch3/` définit les crevettes, fromage cheddar, yogourt nature, beurre, pâtes, haricots rouges, tomates en conserve, farine, sucre, sel et pain tranché. Les trois lots couvrent les 31 ingrédients retenus sans identifiant dupliqué.

Pour cette première recherche, les pâtes sont sèches, les haricots rouges en conserve, la farine de blé tout usage, le sucre blanc granulé et le sel de table. Les crevettes sont recherchées nature ; leur état cru/cuit ou frais/surgelé, les formats et les autres variantes restent à examiner manuellement. Les règles lexicales proposent des candidats sans les approuver.

```sh
.venv/bin/python -m backend.cli.ingest_catalog --source apify --live \
  --batch 3 --location-id 8661 --max-items 110 --max-charge-usd 1 \
  --output-dir data/catalog/maxi/maxi-apify-batch3-01
```

Le quota global de **110** réserve dix résultats à chacun des onze ingrédients. Le plafond total demandé de 1 USD est réparti entre les onze runs (environ 0,090909 USD chacun), sous réserve de son application par Apify. Le token doit être présent dans le terminal de lancement. Les résultats restent séparés des deux premiers lots ; aucun fichier de sélection n'est créé avant la revue manuelle.

## Promotions liées aux 31 ingrédients — maximum 200 résultats

```sh
.venv/bin/python -m backend.cli.ingest_catalog --source apify --live --promos \
  --location-id 8661 --max-items 200 --max-charge-usd 1 \
  --output-dir data/catalog/maxi/maxi-promos-01
```

`--promos` regroupe les trois lots, sans modifier les catégories et règles de leurs ingrédients. Il ignore la sélection `--batch` et active `on_sale_only: true` dans chacun des 31 runs. Le quota global de 200 réserve sept résultats aux quatorze premiers ingrédients et six aux dix-sept autres. Le budget total demandé est réparti entre les runs, sans transfert automatique des quotas inutilisés. Une demande supérieure à 200 est refusée.

Il s'agit des promotions recherchées pour nos ingrédients, pas d'un inventaire de toutes les promotions alimentaires de Maxi ni d'une extraction de circulaire. Des préparations voisines peuvent encore apparaître dans les résultats : les correspondances restent à relire. Les lignes dont `is_on_sale` n'est pas explicitement vrai sont exclues du catalogue et signalées, tout en restant dans les réponses brutes. Le même format JSON, le rejeu et la reprise restent disponibles. Les limites peuvent produire moins de 200 observations, et les doublons moins de 200 produits distincts.

La commande peut créer 31 runs facturables ; le plafond demandé de 1 USD est global, sous réserve de son application par Apify. Aucun prix ou période promotionnelle n'est automatiquement approuvé. Le mode est testé avec des réponses simulées ; sa couverture réelle reste à mesurer.

## Promotions de tous les rayons alimentaires (sans filtre ingrédients)

**Utiliser `--food-promos` pour ce besoin, et non l'ancien `--promos`.**

```sh
.venv/bin/python -m backend.cli.ingest_catalog --source apify --live --food-promos \
  --location-id 8661 --max-items 200 --max-charge-usd 1 \
  --output-dir data/catalog/maxi/maxi-food-promos-01
```

Les 12 rayons fixes sont définis dans `config/catalog/apify_food_categories.json`, avec des identifiants vérifiés dans le schéma public du build Apify : fruits/légumes, lait/œufs, viande, poissons/fruits de mer, garde-manger, aliments internationaux, collations/confiserie, surgelés, boulangerie, plats préparés, boissons et comptoir déli. Le rayon général naturel/biologique n'est pas collecté, car il contient aussi santé/beauté, entretien et suppléments. Des aliments biologiques peuvent néanmoins apparaître dans les autres rayons.

Chaque run utilise `categories` et `on_sale_only: true`, **sans `search_terms`**. La configuration des 31 ingrédients reste inchangée et sert uniquement aux correspondances facultatives après collecte : une promotion sans correspondance est conservée. Les résultats manifestement non alimentaires (catégorie beauté/entretien/animaux ou nom explicite d'aliment pour animaux, shampoing, détergent, etc.) sont exclus et signalés. Cela ne remplace pas la revue de la classification du fournisseur.

200 est le maximum global de lignes téléchargées : 17 pour chacun des huit premiers rayons et 16 pour les quatre autres. Il n'y a pas de garantie d'exhaustivité ou de 200 produits distincts. Douze runs se partagent le budget demandé. Le rejeu et la reprise détectent le plan archivé automatiquement.

`regular_price` conserve `was_price` quand fourni ; `amount` est le prix courant retourné. Les prix membres et lots restent séparés. `valid_to` demeure nul car ce scraper ne fournit pas la date de fin dans le contrat observé ; aucune date n'est inventée. Les captures précédentes restent lisibles. Ce mode est testé avec des réponses simulées, sans collecte réelle lancée pendant son développement.

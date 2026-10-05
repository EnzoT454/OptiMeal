# Catalogue et prix — évaluation et modèle de données proposé

**Conception initiale : 28 septembre 2026. Mise à jour : 4 octobre 2026. Statut : proposition, sans migration ni base créée.**

Ce document évalue la structure transmise par l’équipe : un ingrédient canonique contient des produits commerciaux, chacun contenant ses offres. Il couvre le catalogue, les sources de prix et l’intégration des reçus. Les comptes, recettes, plans et listes sont décrits uniquement aux endroits où ils touchent ces données.

## 1. Verdict

La séparation **ingrédient → produit commercial → offre** est à conserver. Elle distingue correctement ce que demande une recette, ce qui est vendu et le prix proposé dans un contexte donné.

Le JSON imbriqué est utile comme réponse de lecture. Pour PostgreSQL, nous recommandons des tables liées par identifiants : un même produit peut correspondre à plusieurs ingrédients et être vendu dans plusieurs magasins. Le dupliquer sous chaque ingrédient rendrait les corrections et l’historique difficiles à maintenir.

La proposition nécessite surtout six ajustements avant l’implémentation :

1. Séparer **enseigne** et **succursale**, et conserver la portée géographique des prix.
2. Représenter le **contenu du produit** séparément de la **quantité à acheter pour obtenir le prix**.
3. Remplacer `is_exact_price` par une description du prix et de ses conditions.
4. Conserver les **observations de reçus privées** séparément des offres commerciales.
5. Distinguer date d’achat, observation de la source, collecte et validité officielle.
6. Garder les valeurs inconnues à `null`, avec provenance et validation ; aucun zéro ou `false` par défaut pour masquer une information absente.

## 2. État réel du dépôt

| Composant | Disponible aujourd’hui | Conséquence pour la conception |
| --- | --- | --- |
| `app/database.py`, modèles et `alembic/env.py` | Squelettes conservés, sans connexion, modèles SQL ni migration fonctionnelle | Compléter les fichiers préparés lors de l’intégration PostgreSQL |
| `app/catalog/apify_ingestion.py` et `apify_batch.py` | Normalisation des captures Apify, produits, formats, prix et avertissements | Prévoir l’insertion des données vérifiées ; Metro/Super C web IA restent à développer |
| `app/receipts/schemas.py` | Contrat `receipt-1.1`, OCR local, articles, ajustements et contrôles | Stocker d’abord une extraction privée à vérifier |
| Comptes et confirmation des reçus | Non implémentés | Ne pas ouvrir un import partagé avant les contrôles de propriété |

SQLAlchemy et Alembic sont l’approche envisagée dans le backend. Les squelettes présents préparent leur intégration, sans constituer une configuration exécutable. Les migrations devront devenir l’unique référence exécutable du schéma ; ce document ne les remplace pas.

## 3. Évaluation des champs transmis

| Proposition | Évaluation et choix recommandé |
| --- | --- |
| `ingredient.id`, `name`, `category` | À conserver. Identifiant interne stable ; catégorie contrôlée, nullable pendant la préparation |
| `aliases` | À conserver avec langue et statut. « Oignon » ne désigne pas nécessairement « Oignon jaune » ; « riz indien » ne prouve pas « basmati » |
| `ingredient.products` | Bonne vue de lecture ; relation plusieurs-à-plusieurs en base, avec correspondance validée |
| Produit : `name`, `brand`, `barcode` | Nom canonique du produit, marque nullable ; identifiants typés et vérifiés plutôt qu’un code numérique universel |
| `format_raw`, `quantity`, `unit` | Conserver le texte et préciser si la quantité décrit un paquet fixe ou un produit vendu au poids |
| `store_id: "maxi"` | Renommer en `retailer_id`. Réserver `store_id` à une succursale réelle |
| `external_product_id` | Identité dans un catalogue externe, indépendante du prix ; rattacher à une référence fournisseur/enseigne |
| `price`, `regular_price` | Décimaux exacts ; le prix régulier reste nullable et doit avoir une provenance comparable |
| `is_promotion`, `loyalty_required` | Trois états : `true`, `false`, `null` si inconnu. Un prix inférieur à un ancien prix ne prouve pas une promotion |
| `valid_from`, `valid_to` | Dates officielles, nullables si absentes ; ne pas prolonger automatiquement une promotion |
| `observed_at` | À conserver, mais définir son sens séparément de `retrieved_at` et de la date d’achat |
| `source_type`, `source_url` | Insuffisants seuls : ajouter une capture source, ses dates et le statut de validation |
| `source_type: "receipt"` dans les offres | À déplacer vers le parcours privé des observations après achat |
| `is_exact_price` | Trop ambigu : « 2 pour 5 $ » est un montant exact sous condition, tandis que « à partir de » est une borne |
| Quantité ou prix à `0` dans le gabarit | Remplacer par `null` pour inconnu. Les vrais articles gratuits exigent un traitement explicite |

## 4. Relations et tables proposées

Les identifiants internes seront des UUID. Les noms tels que `ing_oignon_jaune` dans les exemples sont des identifiants pédagogiques, pas des UUID à insérer tels quels.

```text
ingredient ← ingredient_product → product ← product_listing → retailer
     ↑                                           ↑               ↑
ingredient_alias                          commercial_price     store
                                                 ↓
                                           source_capture

user → receipt_import → receipt_line → price_observation
                            ↓                  ↓
                  produit rapproché      produit et magasin
                   après vérification     confirmés si connus
```

Une flèche représente une référence, pas une copie du contenu. Une enseigne possède plusieurs succursales ; une référence commerciale possède plusieurs relevés de prix. Les offres peuvent concerner une succursale, une région explicite, toute l’enseigne si la source le prouve, ou une portée inconnue.

### 4.1 Ingrédients et correspondances

| Table | Champs principaux | Contraintes et rôle |
| --- | --- | --- |
| `ingredient` | `id`, `name`, `category_code`, `state`, `created_at` | Concept utilisé par les recettes, par exemple oignon jaune cru |
| `ingredient_alias` | `id`, `ingredient_id`, `label`, `normalized_label`, `locale`, `status` | Unique par ingrédient, alias normalisé et langue ; le même alias peut désigner plusieurs candidats |
| `ingredient_product` | `ingredient_id`, `product_id`, `match_kind`, `status`, `reason`, `reviewed_at` | Clé composée ; lien explicite entre besoin culinaire et produit |

`match_kind` distingue `direct` et `substitution`. `status` distingue `proposed`, `validated` et `rejected`. Une substitution, même validée au catalogue, n’est autorisée dans une liste que si les contraintes de la recette et les choix de l’utilisateur le permettent.

Normaliser accents, casse et pluriels peut aider la recherche, sans prouver l’équivalence. « Oignon frais », « oignon en poudre » et « soupe à l’oignon » ne sont pas fusionnés automatiquement. Un mélange de légumes ne devient pas plusieurs ingrédients disponibles dans des proportions inventées.

### 4.2 Produits, formats et magasins

| Table | Champs principaux | Contraintes et rôle |
| --- | --- | --- |
| `product` | `id`, `name`, `brand`, `format_kind`, `format_raw`, `content_quantity`, `content_unit`, `state` | Une ligne représente une variante vendable précise ; sacs de 2 kg et 5 kg distincts |
| `product_identifier` | `id`, `product_id`, `kind`, `value`, `namespace`, `status` | GTIN confirmé, code marchand ou autre identité sourcée |
| `retailer` | `id`, `slug`, `name` | Enseigne ; `slug` unique : `maxi`, `metro`, `superc` |
| `store` | `id`, `retailer_id`, `external_store_id`, `name`, `address`, `timezone`, coordonnées nullables | Succursale ; code externe unique à l’intérieur d’une enseigne lorsqu’il est connu |
| `product_listing` | `id`, `product_id`, `retailer_id`, `source_namespace`, `catalog_scope_key`, `external_product_id`, `retailer_name`, `retailer_url` | Correspondance avec un catalogue marchand ; ne contient pas le dernier prix comme valeur écrasable |

Pour une première version, le format appartient directement au produit vendable. Une table de familles de produits et une table de formats séparée ne sont pas nécessaires. Cela précise la piste `ProductFormat` du cadrage initial sans supprimer la gestion des formats.

`format_kind` vaut `fixed`, `variable_weight` ou `unknown`. Pour un sac de 3 lb : quantité `"3"`, unité `lb`. Pour des pommes vendues au kg : contenu du paquet inconnu ; la quantité pesée appartient à la ligne d’achat. Pour « 6 × 100 g », conserver le texte et un contenu total de `"600"` g seulement si la lecture est validée. Les fourchettes de formats ou emballages ambigus restent en préparation, sans contenu exact inventé.

Les unités de contenu initiales sont `g`, `kg`, `ml`, `L`, `lb`, `unit`. Le paquet (`package`) est une unité de vente, distincte de son contenu. Les conversions masse/masse ou volume/volume sont calculées par code ; aucune conversion masse/volume ou pièce/gramme sans référence explicite.

Un GTIN sert à identifier un article commercial ; tous les chiffres d’un reçu ne sont pas des GTIN. Les codes de produits au poids peuvent aussi porter des informations variables. Conserver les codes en **texte** pour préserver les zéros initiaux ; ne jamais fabriquer un code manquant ni fusionner sur le seul nom. Une clé de contrôle valide ne prouve pas l’association au bon produit. Sources : [GS1 — GTIN](https://www.gs1.org/standards/id-keys/gtin), [GS1 — articles à mesure variable](https://support.gs1.org/support/solutions/articles/43000734396-what-is-a-variable-measure-trade-item-).

### 4.3 Sources et prix commerciaux

| Table | Champs principaux | Rôle |
| --- | --- | --- |
| `source_capture` | `id`, `source_type`, `source_namespace`, `source_url`, `artifact_key`, `content_hash`, `retrieved_at`, `published_at`, `extractor_version`, `schema_version`, `dataset_kind`, `validation_status` | Trace d’une collecte Apify, web ou saisie manuelle documentée |
| `commercial_price` | `id`, `listing_id`, `source_capture_id`, `source_record_key`, `store_id`, portée, montants, base de vente, conditions, dates et statut | Assertion de prix provenant d’une source commerciale, conservée avec son contexte |

`source_type` décrit le moyen de collecte (`api`, `scrape`, `flyer`, `manual`). Il ne prouve pas la qualité : un montant extrait du web peut être erroné. `dataset_kind` sépare `real` et `demo`. Les documents privés des reçus suivent les tables privées décrites plus bas.

Champs métier du prix :

| Champ | Sens recommandé |
| --- | --- |
| `amount`, `currency` | Montant pour la base de vente indiquée ; CAD pour le périmètre initial |
| `price_type` | `fixed`, `bundle`, `starting_at`, `unknown` |
| `basis_quantity`, `basis_unit` | Quantité couverte par le montant : 1 paquet, 2 paquets ou 1 kg |
| `minimum_purchase_quantity` | Minimum explicitement exigé, nullable si non précisé |
| `regular_amount` | Référence régulière comparable, nullable ; même base et même portée, avec source si différente |
| `is_promotion`, `loyalty_required` | Booléens nullables ; ne pas déduire une réponse absente |
| `conditions_raw`, `conditions_status` | Texte des coupons, limites, mélanges de produits, etc. ; `supported`, `review_required`, `unknown` |
| `scope_kind`, `region_code`, `store_id` | `store`, `region`, `retailer` ou `unknown` ; une succursale inconnue ne signifie pas toutes les succursales |
| `observed_at`, `retrieved_at` via la capture | Moment du relevé à la source et moment de récupération par OptiMeal |
| `valid_from`, `valid_to` | Dates officielles si fournies ; bornes inclusives selon le fuseau de la portée |
| `taxes_included`, `deposit_amount` | Informations explicites, nullables ; inconnu ne signifie pas absent |
| `validation_status`, `warnings`, `supersedes_id` | Préparation, vérification, rejet ; correction traçable d’un relevé précédent |

La portée `retailer` exige une preuve d’application à toute l’enseigne. Sans cette preuve, choisir `unknown`. Une offre régionale ne s’applique qu’aux succursales rattachées à cette région. Toute portée non vérifiable doit être signalée avant la comparaison du panier.

**Exemples de prix :**

- 2,99 $ le sac de 3 lb : `fixed`, montant `"2.99"`, base `"1" package` ; contenu du produit `"3" lb`.
- 2 sacs pour 5 $ : `bundle`, montant `"5.00"`, base `"2" package`. Le prix de 2,50 $ par sac est dérivé et conditionnel. Un seul sac ne coûte pas nécessairement 2,50 $ ; trois sacs peuvent demander le prix individuel pour le troisième ou l’achat d’un quatrième.
- 6,35 $/kg : `fixed`, montant `"6.35"`, base `"1" kg` ; coût final dépend du poids.
- À partir de 5,49 $ : `starting_at`, montant `"5.49"` ; aucune borne supérieure connue, donc pas un prix total exact utilisable comme tel.
- Prix absent : `unknown`, montant `null`. Aucun article n’est évalué à zéro par défaut.

Un prix connu sous condition n’est pas une estimation. Une condition non interprétée bloque les calculs qui en dépendent. Les points de fidélité ne sont pas automatiquement une réduction monétaire.

### 4.4 Reçus et observations privées

| Table | Champs principaux | Rôle |
| --- | --- | --- |
| `receipt_import` | `id`, `owner_id`, `image_key`, `sha256`, `engine`, `extractor_version`, `schema_version`, `extracted_payload`, `imported_at`, `status` | Photo privée et extraction brute versionnée ; JSONB pertinent ici |
| `receipt_line` | `id`, `receipt_import_id`, `line_id`, `revision`, `corrected_payload`, `matched_product_id`, `match_status`, `confirmed_at` | Correction et rapprochement d’une ligne, sans effacer le texte OCR |
| `price_observation` | `id`, `owner_id`, `receipt_line_id`, `confirmation_revision`, `product_id`, `retailer_id`, `store_id`, `purchased_on`, quantités et montants, `comparability_status`, `recorded_at` | Prix déclaré après confirmation, jamais transformé directement en offre courante |

Une observation conserve quantité achetée/unité, montant de marchandise, taxes et consignes connues, conditions, ajustements attribuables et texte source autorisé. Si un rabais de panier ne peut pas être attribué aux articles, ne pas calculer artificiellement leur prix net unitaire. Un règlement en points ou carte-cadeau doit être distingué d’une réduction du prix des marchandises.

`owner_id` vient de la session serveur. Vérifier la propriété du reçu et de la ligne lors de chaque lecture et écriture. Ne pas exposer les photos, codes de fidélité, données de paiement, JSON brut ou identifiants de contributeurs dans le catalogue public.

Un produit non rapproché peut rester dans le reçu confirmé, mais n’alimente pas une estimation par produit. Un rapprochement de catégorie éventuel exige une règle distincte et ne devient pas une identité exacte.

### 4.5 Estimations et historique

L’estimation est un calcul ultérieur, distinct de `commercial_price` et de `price_observation`. Prévoir `price_estimate` avec cible, portée, unité, bornes basse/haute, date de calcul, version de méthode, période des observations, effectif et provenance interne. Les seuils statistiques du cadrage restent à calibrer ; un reçu isolé ne remplace pas une référence commerciale.

Les recettes référencent les ingrédients canoniques. Les révisions de plans et de listes capturent leurs propres instantanés : produit, format, quantité, prix ou fourchette, conditions et provenance utilisés. Une correction du catalogue ne réécrit pas une ancienne semaine. Les suppressions de produits ne doivent pas entraîner la suppression en cascade des instantanés.

## 5. Types, contraintes et index

### Types proposés

- UUID pour les clés internes ; texte pour les identifiants externes et codes-barres.
- `numeric(12,2)` pour les montants facturés, `numeric(18,8)` pour quantités et valeurs unitaires dérivées. Calculs Python avec `Decimal`, chaînes décimales dans le JSON. Ces précisions sont des choix de projet à confirmer sur les sources ; valider les décimales avant insertion afin de ne pas accepter un arrondi silencieux. PostgreSQL fournit `numeric` pour les calculs exacts. [Documentation PostgreSQL](https://www.postgresql.org/docs/current/datatype-numeric.html)
- `date` pour validité et jour d’achat ; `timestamptz` pour les instants de collecte et de validation. Conserver séparément le fuseau de la succursale : `timestamptz` ne préserve pas le nom du fuseau d’origine. [Dates et heures PostgreSQL](https://www.postgresql.org/docs/current/datatype-datetime.html)
- Colonnes relationnelles pour identités, montants, unités, dates et relations recherchées. JSONB pour captures brutes, diagnostics et instantanés versionnés ; pas pour enfouir tout le catalogue dans un document unique.

### Contraintes à réaliser avec les migrations

| Contrôle | Règle |
| --- | --- |
| Quantités | Strictement positives si connues ; quantité et unité présentes ensemble, sinon toutes deux nulles |
| Montants | Finis ; jamais `NaN`/infini. Montants commerciaux positifs ; cas gratuits gardés en préparation jusqu’à définition de leur traitement. Ajustements signés séparés |
| Dates | Si les deux bornes existent, `valid_to >= valid_from`. Date future d’achat rejetée ou mise en revue lors de la confirmation |
| Portée | `store` exige une succursale ; `region` une région ; les autres portées ne portent pas une fausse succursale |
| Enseigne | La succursale ciblée doit appartenir à l’enseigne de la référence commerciale |
| Identité | GTIN confirmé unique après normalisation documentée ; identifiant marchand unique dans son espace fournisseur, enseigne et portée de catalogue |
| Historique | Identifiants de source et versions stables ; une correction ne détruit pas l’ancienne assertion |
| Reçu | Unicité `(receipt_import_id, line_id, revision)` ; observation unique par ligne et révision confirmée |
| Estimation | Même devise/base et borne basse ≤ borne haute ; références privées non exposées |

Utiliser `NOT NULL`, `CHECK`, `UNIQUE` et clés étrangères selon la règle. Un `CHECK` seul ne remplace pas `NOT NULL`. Les relations entre enseigne et succursale nécessitent une clé étrangère composée ou une validation transactionnelle appropriée, pas un `CHECK` lisant une autre table. Prévoir explicitement les identifiants externes nullables lors des contraintes d’unicité. [Contraintes PostgreSQL](https://www.postgresql.org/docs/current/ddl-constraints.html)

Index initiaux : alias normalisé/langue, liens ingrédient–produit dans les deux sens, identités externes, prix par référence commerciale et date d’observation, portée/validité, reçus par propriétaire/date, observations par propriétaire et cible/date. Les index supplémentaires seront choisis après mesure des requêtes ; pas de moteur de recherche distinct au départ.

## 6. Dates, corrections et dédoublonnage

| Champ | Exemple de signification |
| --- | --- |
| `valid_from`, `valid_to` | Promotion officiellement valable du 24 au 30 septembre |
| `observed_at` | Le fournisseur déclare avoir relevé le prix le 27 septembre |
| `retrieved_at` | OptiMeal récupère ce relevé le 28 septembre |
| `published_at` | Date de publication connue du document ; sinon null |
| `purchased_on` | Jour de l’achat imprimé sur le reçu, confirmé par l’utilisateur |
| `imported_at`, `confirmed_at` | Réception du fichier et validation ultérieure dans OptiMeal |

Pour une collecte directe, observation et récupération peuvent coïncider si cette signification est documentée. Pour Apify, conserver la date de capture sans la présenter comme la publication du marchand. Pour Metro/Super C, préserver les dates source et de récupération séparément si elles sont disponibles. Pour un reçu où seul le jour est fiable, conserver une `date`, sans inventer une heure ou un fuseau. Aucun prix sans dates officielles ne devient une promotion valable jusqu’à la prochaine collecte.

`retrieved_at` est obligatoire pour une capture effectuée par OptiMeal. `observed_at` et `published_at` restent nullables si la source ne donne pas ces informations. Pour une offre de portée régionale, conserver le fuseau de cette portée ; si les frontières calendaires ne peuvent pas être établies, la validité locale reste non vérifiable.

Chaque collecte crée une capture identifiable. Rejouer la même capture avec les mêmes versions et la même clé de ligne ne doit pas dupliquer un prix. Une collecte distincte du même prix peut en revanche apporter une observation de fraîcheur : ne pas dédupliquer uniquement sur produit + montant.

Proposer une clé d’unicité `(source_capture_id, source_record_key)` pour les assertions intégrées ; la clé de ligne comprend le cas échéant la variante et les conditions. Les offres similaires provenant de plusieurs sources gardent leurs preuves, même si une vue de lecture les regroupe.

Pour les reçus, détecter un même fichier par `(owner_id, sha256)` et versionner ses extractions ; ne pas révéler à un utilisateur qu’un autre possède le même fichier. Une clé d’idempotence par propriétaire et opération traite les répétitions réseau : même clé et même contenu donnent le même résultat, contenu différent produit un conflit. Une photo différente du même ticket demande une détection supplémentaire, sans fusion automatique de deux achats distincts.

## 7. Passage des données actuelles à la base

### Catalogue Apify Maxi

1. Conserver la réponse brute et sa capture.
2. Résoudre l’enseigne ; laisser la succursale inconnue si la source ne l’indique pas.
3. Rapprocher le produit et son format. L’identifiant fournisseur Apify reste une référence externe, pas une identité universelle du produit.
4. Conserver séparément les variantes de produits et les conditions de prix par lot ou de fidélité ; ne pas les fusionner parce qu’elles partagent le même nom.
5. Créer des assertions commerciales en préparation avec les avertissements existants ; seules les valeurs suffisamment vérifiées alimentent les calculs correspondants.

### Extraction `receipt-1.1`

| Champ actuel | Destination proposée | Ce qu’il ne faut pas déduire |
| --- | --- | --- |
| `source.sha256`, `engine`, `schema_version` | `receipt_import` | Pas une validation des prix |
| `retailer`, `store_id` | Résolution enseigne et code externe de succursale | Le code `8661` n’est pas l’UUID d’un magasin ; null ne signifie pas toute l’enseigne |
| `purchase_date` | Jour d’achat candidat, puis confirmé | Pas une période de validité commerciale |
| `items[].product_code` | Code brut à classifier | Pas un GTIN garanti ; `4131` ne doit pas devenir un UPC |
| `name`, `category_raw`, `source_lines` | Texte OCR conservé dans la ligne | Pas un ingrédient canonique ni une catégorie validée |
| `quantity`, `unit`, `unit_price`, `line_total` | Valeurs candidates à corriger | Quantité absente ≠ 1 ; montant de ligne ≠ prix par paquet |
| `adjustments`, `totals` | Extraction complète et contrôles de confirmation | Un contrôle `matches` ne confirme pas l’identité produit |

Exemples issus des essais :

- Pommes Maxi : `0.785 kg`, `6.35 CAD/kg`, ligne `4.98 CAD`. Le poids acheté appartient à l’observation ; il ne définit pas un format permanent de 785 g.
- Reçu Metro initial : rabais lu `−8.99` au lieu de `−0.99`. Le document reste à corriger ; l’écart arithmétique ne justifie pas une correction automatique ni une intégration commerciale.
- Second reçu Metro : marchandises `29.14`, récompense utilisée `4.00`, paiement carte `25.14`. Ne pas remplacer le coût des articles par le montant débité sur la carte.

Le parcours cible est **import privé → extraction → correction → rapprochement produit/magasin → confirmation → observation admissible ou non comparable**. La contribution aux estimations communes reste facultative et soumise aux règles d’agrégation.

## 8. Exemple de vue JSON de catalogue

Le fichier [catalog.proposed.json](examples/catalog.proposed.json) fournit une vue imbriquée illustrative proche de la proposition initiale. Les prix et identifiants y sont **fictifs**, avec `dataset_kind: demo`. Cette vue serait assemblée par le backend à partir des tables ; ce n’est ni un modèle SQL à copier en JSONB ni un endpoint déjà disponible.

Les observations privées n’y figurent pas. Une éventuelle estimation publique aurait sa propre section avec bornes, unité, méthode et avertissements, sans reçu ni contributeur identifiable. Prévoir des filtres de date/portée et une pagination des produits et offres avant d’en faire un contrat API.

## 9. Livraison progressive et validations attendues

| Étape | Livrable | Vérification attendue |
| --- | --- | --- |
| 1 | Connexion PostgreSQL et migrations ; ingrédients, alias, produits, enseignes, magasins, correspondances et sources | Installation reproductible, liens intègres, jeu de démonstration séparé |
| 2 | Assertions commerciales et intégration Apify Maxi ; adaptateurs web IA Metro/Super C | Dates, unités, formats, portées et répétition d’un import contrôlés |
| 3 | Comptes, imports privés, corrections et confirmation de reçus | Deux utilisateurs isolés ; aucune observation confirmée lors de l’OCR seul |
| 4 | Observations comparables et estimations | Conditions compatibles, fourchettes justifiées, observations incertaines exclues |
| 5 | Intégration aux recettes, plans et listes | Besoins couverts ou signalés, formats entiers et historique stable |

Cas de validation à préparer avant les migrations et services concernés :

- Un produit vendu dans deux enseignes conserve une identité interne, deux références marchandes et des prix distincts.
- Deux formats d’une même marque ne sont pas fusionnés ; un code externe réutilisé dans un autre espace ne collisionne pas.
- Un alias ambigu retourne plusieurs candidats ; aucune substitution alimentaire silencieuse.
- « 2 pour 5 $ » ne devient pas un prix de 2,50 $ accessible pour une seule unité sans preuve.
- Une offre expirée ou de portée inconnue n’est pas présentée comme garantie pour la succursale choisie.
- Un import rejoué ne duplique pas les données ; une correction conserve les anciennes valeurs.
- Une ligne OCR sans quantité ou format reste non comparable si le prix unitaire ne peut pas être établi.
- Les rabais informatifs ne sont pas soustraits une deuxième fois ; une récompense de paiement ne réduit pas artificiellement le prix des produits.
- Une modification de produit ou de prix ne change pas une ancienne liste sauvegardée.

## 10. Points restant à trancher avant développement

1. Version PostgreSQL, pilote, sessions SQLAlchemy et organisation des migrations : choisir et installer une seule chaîne technique.
2. Liste initiale d’ingrédients, catégories et règles de substitution : construire un petit référentiel relu.
3. Sources d’identité des succursales et des zones : éviter de considérer l’enseigne comme une localisation.
4. Conditions de prix prises en charge au premier import : les cas non pris en charge restent explicites et non calculables.
5. Définition des rôles de validation du catalogue et de confirmation des reçus ; méthode de rapprochement produit.
6. Durées de conservation des photos, suppression des comptes et sort des données agrégées : définir la politique avant intégration des reçus privés.
7. Critères de fraîcheur et méthode d’estimation : calibrer sur des données réelles, sans présenter les seuils proposés comme déjà évalués.

Cette proposition permet de commencer le catalogue sans concevoir toute l’application d’un seul coup. Les tables d’estimation et d’historique seront livrées avec leurs fonctionnalités, en conservant dès le départ les identités et la provenance nécessaires.

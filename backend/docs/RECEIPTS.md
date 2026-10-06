# Extraction locale de reçus

Le [guide des données locales](DATA.md) décrit les images dans `data/receipts/images/`, les résultats dans `extractions/`, les blocs bruts dans `ocr/` et les anciens diagnostics dans `archives/`.

Le script lit une photo de reçu avec détection de format (Maxi, Metro ou générique) et produit un JSON validé par Pydantic. Il ne fait aucun appel HTTP, ne demande aucune clé et ne sauvegarde aucune observation de prix en base. Le résultat reste une **proposition à vérifier**.

Les prix du jeu de reçus Maxi/Metro fourni ont fait l’objet d’une
[validation humaine le 4 octobre 2026](#validation-humaine-des-prix--4-octobre-2026).
Cette validation de l’échantillon ne remplace pas la vérification de chaque
nouvelle extraction.

## Lancer sur ce projet

Depuis la racine, avec l’environnement Python du projet :

```bash
.venv/bin/python -m backend.cli.extract_receipt data/receipts/images/recu_maxi.jpg \
  --output data/receipts/extractions/recu_maxi.json
```

Sur macOS, le moteur automatique utilise **Apple Vision**, exécuté localement par le petit programme Swift fourni. Il faut que `swift` soit disponible (outils de développement Apple). La première compilation peut être plus lente ; son cache est placé dans `.cache/swift-receipts/`. Aucune nouvelle dépendance Python n’est nécessaire : Pydantic est déjà utilisé par le backend.

Pour exporter le contrat JSON indépendamment d’une image :

```bash
.venv/bin/python -m backend.cli.extract_receipt \
  --schema data/receipts/receipt.schema.json
```

Sans `--output`, le JSON est écrit sur la sortie standard. Le résumé est écrit sur la sortie d’erreur. Les codes de sortie sont `0` pour une extraction comportant des articles, `2` si aucun article n’est trouvé et `1` en cas d’échec technique. **Le code 0 ne signifie pas que les données sont confirmées.**

## Pourquoi ce choix ?

OpenCV sert au traitement d’image : agrandissement, redressement ou découpage. Un moteur OCR reste nécessaire pour reconnaître le texte. Le chemin Apple Vision reste inchangé ; OpenCV est utilisé pour les variantes Tesseract.

Vision est limité à macOS dans ce script. Pour un environnement Linux ou Windows, un adaptateur **Tesseract** est également fourni :

```bash
python -m backend.cli.extract_receipt data/receipts/images/recu_maxi.jpg \
  --engine tesseract --languages fra+eng \
  --output data/receipts/extractions/recu_maxi.tesseract.json
```

Il faut installer séparément l’exécutable `tesseract` et les données de langues `fra` et `eng`. Le script utilise sa sortie TSV et `--psm 4` par défaut, adapté aux reçus en longue colonne. Avec `--tesseract-preprocess auto` (défaut), il compare le reçu entier à un recadrage local allant de l’en-tête au dernier total détecté : cela retire les paiements, codes-barres et publicités qui perturbent la mise en page. Pour un reçu générique qui reste non vérifiable, il compare aussi les segmentations Tesseract 3, 6, 11 et 12, puis conserve le meilleur candidat selon les articles lus, les totaux et les lignes ambiguës. `opencv-python-headless` est installé avec les dépendances Python pour effectuer ce recadrage ; aucune image originale n'est modifiée. `--tesseract-preprocess none` désactive cette seconde lecture, et `--tesseract-psm 6` ou `11` permet d'imposer un format précis. Le parseur retire seulement les préfixes OCR manifestement parasites avant une structure Maxi connue et conserve la ligne source ainsi qu’un avertissement. Il ne télécharge pas les modèles et n’installe pas de logiciel automatiquement. La qualité reste à vérifier sur chaque image ; aucun classement général de précision entre moteurs n’est établi.

Références : [Apple Vision — reconnaître le texte localement](https://developer.apple.com/documentation/vision/recognizing-text-in-images) et [Tesseract — langues, TSV et segmentation](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html).

### Modèle complémentaire pour les rabais Metro

Sur `recu_metro.png`, le modèle standard confond le rabais membre **−0,99**
avec **−8,99**. Quand le contrôle Metro est en écart, le pipeline compare
aussi une image agrandie en PSM 6 (utile pour les taxes). Il recadre seulement
le montant signé d'une ligne « RABAIS MEMBRE », l'agrandit avec OpenCV et le
relit en PSM 7 avec le modèle officiel
[tessdata_best](https://github.com/tesseract-ocr/tessdata_best), moteur LSTM
`--oem 1` et caractères numériques. Il ne calcule pas un prix pour forcer
le sous-total : la nouvelle valeur provient de la relecture des pixels.
Le candidat doit améliorer les contrôles pour remplacer le résultat initial,
et conserve l'avertissement `member_discount_reread_requires_review`.

Ce modèle est **nécessaire pour reproduire le résultat Metro ci-dessous**.
Il n'est ni livré dans Git ni téléchargé automatiquement. Depuis la racine :

```bash
mkdir -p .cache/receipt-tessdata-best
curl -fL https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main/eng.traineddata \
  -o .cache/receipt-tessdata-best/eng.traineddata
```

Équivalent Windows PowerShell, après installation de Tesseract (`fra` et
`eng`) et ajout de son dossier au `PATH` :

```powershell
New-Item -ItemType Directory -Force .cache/receipt-tessdata-best
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main/eng.traineddata' -OutFile '.cache/receipt-tessdata-best/eng.traineddata'
python -m pip install -r requirements.txt
tesseract --list-langs
python -m backend.cli.extract_receipt data/receipts/images/recu_metro.png --engine tesseract --languages fra+eng --output data/receipts/extractions/recu_metro.tesseract.json
```

`--price-tessdata-dir DOSSIER` permet un autre emplacement. Sans le modèle,
la lecture standard reste disponible mais l'écart Metro n'est pas résolu.
`--tesseract-preprocess none` désactive aussi cette relecture ciblée.

## Traitement et contrat de données

### Validation humaine des prix — 4 octobre 2026

Après les essais et l’installation des dépendances dans l’environnement
Python du projet, Hamza a confirmé : « les prix sont corrects, vérification
humaine accomplie, pour les reçus Maxi et Metro ». Nous consignons cette
confirmation comme **validation humaine des prix sur l’échantillon local**,
distincte des contrôles arithmétiques du programme.

Le jeu d’essai Maxi/Metro auquel se rapporte ce travail contient :

| Image | Enseigne | Résultat de la dernière vérification technique Tesseract + OpenCV |
| --- | --- | --- |
| `data/receipts/images/recu-h1.jpg` | Maxi | 12 lignes, somme et total 60,43 CAD ; sardines 4 × 1,89 = 7,56 CAD |
| `data/receipts/images/recu_maxi.jpg` | Maxi | 13 lignes, somme et total 46,66 CAD |
| `data/receipts/images/recu_metro.png` | Metro | 6 lignes, somme 34,44 CAD ; rabais −0,99, sous-total 33,45, taxes 1,50, total 34,95 CAD |
| `data/receipts/images/recu_2.png` | Metro | 4 lignes, somme et total 29,14 CAD |

La confirmation humaine porte sur les **prix**, pas sur l’ensemble du
JSON : noms abrégés, codes, quantités, formats et dates ne sont pas déclarés
intégralement validés. La date de `recu_metro.png` reste notamment inconnue.
Il ne s’agit pas d’un taux de précision mesuré sur tous les reçus de ces
enseignes, ni d’une garantie sur de nouvelles photos.

Les essais des moteurs ont été effectués sur macOS. Apple Vision demeure
fonctionnel et inchangé, mais son dernier essai sur `recu_metro.png` lit
encore le rabais −8,99 au lieu de −0,99 : ce résultat précis reste à corriger.
La concordance Metro du tableau nécessite le chemin Tesseract + OpenCV et
le modèle complémentaire `eng.traineddata` de `tessdata_best`. L’installation
et l’exécution sur un PC Windows n’ont pas encore été validées.

Les sorties sont dans `data/receipts/`, qui n’est pas ignoré par Git ; vérifier et masquer les informations privées avant publication. Cette
note n’a pas réécrit les JSON ni les captures OCR historiques : en
particulier, `data/receipts/extractions/recu_metro.json` est un ancien rejeu contenant
encore le rabais −8,99 et un contrôle en écart. Ce fichier n’est pas la
sortie Tesseract améliorée décrite ci-dessus. La confirmation n’a pas non
plus modifié le contrat `receipt-1.1` : les nouvelles extractions conservent
`status: review_required` et `review_required: true` sur les articles.
Il n’existe pas encore de parcours applicatif de confirmation persistée
ni d’écriture d’observations en PostgreSQL.

La priorité reste Maxi, Metro et Super C. Pour la prochaine validation :
tester Tesseract sur Windows avec les mêmes images, ajouter un reçu Super C
annoté, puis élargir l’échantillon. Les autres enseignes ne sont pas
prioritaires pour l’instant.

### Vérifications Windows/Tesseract du 4 octobre 2026

Les blocs Tesseract conservent maintenant les identifiants de ligne TSV. Le
pipeline compare cette reconstruction avec la reconstruction géométrique ;
Vision conserve sa reconstruction géométrique habituelle. Pour les reçus
génériques incomplets, OpenCV propose aussi une image en niveaux de gris,
agrandie jusqu'à une largeur cible de 1400 pixels (facteur maximal 3), avec
redressement d'une petite inclinaison mesurable et bordure blanche. Cette
variante n'est retenue que si les contrôles donnent un meilleur candidat.
Les modèles OCR, chiffres et images originales ne sont pas modifiés.

`--tesseract-preprocess none` désactive les variantes de segmentation et les
images préparées/recadrées. Les chemins contenant des accents sont pris en
charge lors de la lecture et de l'écriture OpenCV.

| Image locale | Articles Tesseract | Somme des montants lus | Contrôle |
| --- | ---: | ---: | --- |
| `recu-h1.jpg` | 12 | 60,43 CAD | Concordant |
| `recu_maxi.jpg` | 13 | 46,66 CAD | Concordant |
| `recu_metro.png` | 6 | 34,44 CAD avant rabais | Concordant avec relecture tessdata_best |
| `recu_2.png` | 4 | 29,14 CAD | Concordant |
| `recu-nouh.png` | 20 | 68,54 CAD | Non vérifiable, extraction partielle |
| `recu-nouh2.png` | 5 | 14,37 CAD | Écart signalé, extraction partielle |

Les quatre reçus Maxi/Metro ont été relancés après les changements : mêmes
nombres de lignes que dans ce tableau, contrôles arithmétiques concordants.
Pour Metro : rabais −0,99, sous-total 33,45, taxes 1,50 et total 34,95 CAD.
Les sardines de `recu-h1.jpg` sont lues à 7,56 CAD (4 × 1,89).
La date de `recu_metro.png` reste inconnue (`invalid_purchase_date`) et
certains libellés comportent encore des erreurs OCR ; ce n'est pas une
validation exhaustive de tous les champs.

Ces essais Tesseract ont été réalisés sur macOS ; l'installation doit encore
être vérifiée sur un PC Windows. Une extraction Vision réelle des quatre
reçus retrouve respectivement 12, 13, 6 et 4 lignes. Ses contrôles sont
concordants sauf sur `recu_metro.png` : Vision lit encore le rabais −8,99.
Le chemin Vision n'a pas été modifié. Les cinq anciennes captures Vision
rejouées conservent les résultats précédents. Il n'y a pas encore de reçu Super C
annoté ni de profil spécifique Super C. Les sommes concordantes restent des
contrôles arithmétiques et ne confirment pas les noms ni tous les champs.

Les nouvelles captures `--save-ocr` utilisent une enveloppe `receipt-ocr-2`
avec moteur, empreinte SHA-256 de l'image, blocs sélectionnés et blocs de la
lecture complète. Le rejeu vérifie l'empreinte et applique les mêmes règles
Tesseract sans nouvel appel OCR. Les anciennes listes de blocs Vision restent
lisibles. La date reconnue dans la lecture complète est conservée lorsqu'un
recadrage l'a retirée. Les anciennes captures Tesseract sans identifiants TSV
peuvent être rejouées avec les règles historiques, mais n'identifient pas
leur moteur d'origine : refaire une capture au nouveau format pour un rejeu
Tesseract reproductible.

1. Le moteur lit le texte et la position des blocs dans l’image.
2. Python reconstitue les lignes par leur hauteur et leur position horizontale, pour associer la colonne des noms à celle des prix.
3. Le profil détecté identifie les rayons, les articles avec ou sans codes, les montants et les lignes de quantité.
4. Les calculs utilisent `Decimal`, avec arrondi au cent pour contrôler quantité × prix unitaire.
5. Le résultat est validé et sérialisé selon **`receipt-1.1`**, défini dans `schemas.py`.

Le projet ne possédait pas encore de contrat concret d’extraction de reçu. Celui-ci conserve les conventions utiles des exemples existants : version du schéma, provenance, valeurs inconnues à `null`, décimaux en chaînes et avertissements. Il reste distinct du catalogue commercial : un reçu ne fournit pas nécessairement les identifiants, les formats et les conditions d’une offre commerciale. Aucune route HTTP existante n’est modifiée.

| Champ | Sens |
| --- | --- |
| `schema_version`, `status` | Version du contrat et statut toujours `review_required` |
| `parsing_profile` | Profil réellement utilisé : `maxi`, `metro` ou `generic` |
| `adjustments` | Rabais lus : montant signé ou inconnu, effet proposé et texte source |
| `source_kind`, `currency` | Reçu, CAD ; prototype prévu pour Maxi au Québec |
| `retailer`, `store_id` | Enseigne reconnue et numéro imprimé du magasin ; pas un identifiant interne de catalogue |
| `purchase_date`, `date_order` | Date lue avec convention explicite, à confirmer |
| `source` | Nom de l’image, empreinte SHA-256, moteur et durée de traitement |
| `items` | Lignes de produits, quantités explicites, prix, texte source et avertissements |
| `totals` | Sous-total/total lus, somme des articles extraits et contrôle arithmétique |
| `unparsed_lines` | Lignes de la zone d’achat non comprises par les règles, à relire |
| `warnings` | Données manquantes, incohérences et réserves globales |

Extrait d’un article réellement obtenu sur le reçu fourni :

```json
{
  "line_id": 11,
  "product_code": "4131",
  "name": "POMMES FUJI",
  "category_raw": "27-FRUITS ET LEGUMES",
  "format_raw": null,
  "quantity": "0.785",
  "unit": "kg",
  "quantity_source": "explicit",
  "unit_price": "6.35",
  "line_total": "4.98",
  "source_lines": [
    "4131 POMMES FUJI MRJ",
    "0.785 kg @ $6.35/kg 4.98"
  ],
  "review_required": true,
  "warnings": []
}
```

`line_total` est le montant imprimé de la ligne, pas un prix unitaire inventé. Quand la quantité n’est pas explicitement écrite, `quantity`, `unit` et `unit_price` restent `null`. Le script n’invente ni le poids d’un paquet ni la signification d’une abréviation commerciale. Le code `MRJ` est retiré du nom mais reste dans le texte source, sans interprétation fiscale.

La date est lue par défaut en **AA/MM/JJ**, conformément au reçu d’essai (`26/09/27` → `2026-09-27`). L’option `--date-order dmy` permet JJ/MM/AA. La convention reste signalée pour relecture ; une date invalide reste inconnue. Le siècle des années à deux chiffres est 2000 dans ce prototype.

## Résultat de l’essai du 28 septembre 2026

Image : `data/receipts/images/recu_maxi.jpg`. Commande exécutée avec `--engine vision` :

- **13 lignes de produits**, somme **46,66 CAD**, égale au sous-total et au total imprimés.
- Sardines : **3 × 1,89 = 5,67 CAD**.
- Pommes : **0,785 kg × 6,35 CAD/kg**, soit **4,98 CAD** après arrondi.
- Bananes : **0,820 kg × 2,40 CAD/kg**, soit **1,97 CAD** après arrondi.
- Durée observée après compilation initiale : **environ 2,5 secondes**, à titre indicatif sur ce poste.
- Les points de fidélité, paiements et publicités ne sont pas des articles extraits.

Cet essai historique du 28 septembre porte sur **un seul reçu**. La validation humaine des prix de l’échantillon Maxi/Metro est consignée plus haut pour le 4 octobre. L’égalité des sommes seule ne valide ni les noms, ni les codes, ni la complétude : des erreurs pourraient se compenser. Les sorties OCR restent susceptibles d’erreurs de caractères, notamment dans les noms abrégés. Il n’y a pas de précision globale mesurée ni de confirmation automatique.

## Limites connues

- Deux profils spécifiques éprouvés sur les images fournies : Maxi avec rayons numérotés et codes, Metro avec rayons textuels sans codes. Le profil générique produit des candidats à vérifier, sans garantie pour tout reçu. Super C ne possède pas encore de profil spécifique.
- Metro : les lignes positives `Rabais` sont informatives et le `RABAIS MEMBRE` explicitement négatif est une déduction proposée. Les autres rabais, remboursements, consignes et coupons restent à revoir. Les taxes explicites TPS/TVQ/GST/QST/HST sont lues entre sous-total et total ; doublons ou montants illisibles rendent leur somme inconnue. Sans ligne fiscale, les taxes restent `null`, même si sous-total et total sont identiques.
- Les photos floues, fortement inclinées ou avec texte masqué peuvent nécessiter redressement, découpage ou nouvelle prise de vue. Pas de correction automatique de perspective dans cette version.
- Les prix sans séparateur décimal ne sont pas transformés automatiquement en cents.
- Une quantité incohérente ou un écart au sous-total est signalé, jamais corrigé pour forcer l’égalité.
- `items_sum` additionne seulement les montants connus. Si une ligne n’a pas de montant, le contrôle est `unverifiable` ; cette somme ne doit pas être présentée comme un total complet.
- Un résultat conforme au schéma reste privé et à vérifier par défaut. Les prix de l’échantillon Maxi/Metro ont été confirmés manuellement, mais cette confirmation documentaire ne change pas le statut des JSON. Il faudra un parcours de correction et confirmation persistée avant de créer des observations ou d’alimenter des estimations communes.

## Rejouer et tester

Sauvegarde facultative du texte OCR et de ses positions :

```bash
.venv/bin/python -m backend.cli.extract_receipt data/receipts/images/recu_maxi.jpg \
  --save-ocr data/receipts/ocr/recu_maxi.ocr.json \
  --output data/receipts/extractions/recu_maxi.json

.venv/bin/python -m backend.cli.extract_receipt data/receipts/images/recu_maxi.jpg \
  --ocr-json data/receipts/ocr/recu_maxi.ocr.json \
  --output data/receipts/extractions/recu_maxi.replay.json

.venv/bin/python -m pytest backend/tests -q
```

Les blocs OCR bruts peuvent contenir des renseignements de paiement ou de fidélité : ils sont dans `data/`, qui n’est pas ignoré par Git. Vérifier et masquer ces informations avant publication. Le JSON d’extraction conserve les lignes d’achat et écarte la zone de paiement reconnue ; toute sortie reste à traiter comme privée. Le mode de rejeu attend les blocs de **la même image** et s’identifie comme `saved_ocr_replay` dans la provenance.

Les tests utilisent des données synthétiques, sans image privée, réseau ni moteur OCR. Ils couvrent notamment les produits pesés, lots, décimaux, prix absents, sous-totaux incohérents, unités incompatibles, dates, colonnes de texte et exclusion des paiements.

## Détection des formats et repli générique

La reconnaissance OCR est partagée. `parser.py` orchestre la lecture ; `rules/maxi.py`, `rules/metro.py` et `rules/generic.py` interprètent les formats ; `validation.py` contrôle les calculs.

La détection automatique associe des indices d’enseigne et de structure :

- **Maxi** : nom dans l’en-tête et rayons numérotés.
- **Metro** : nom dans l’en-tête ou référence spécifique `METROSONDAGE.CA` / `Rabais metro&moi`, avec rayons textuels. « Programme Moi » seul ne suffit pas.
- **Générique** : enseigne inconnue, indices ambigus ou mise en page non reconnue. Un logo Maxi avec une autre structure peut donc utiliser le profil générique.

Le profil générique repère un nom suivi d’un montant, ou une description suivie d’une ligne quantité/prix. Il utilise les rayons connus ; sans rayon, il exige un sous-total ou total comme borne. Les paiements, récompenses, taxes et ajustements reconnus ne deviennent pas des articles. Une description inconnue de la zone d’achat reste dans `unparsed_lines`. Chaque article générique est explicitement marqué comme candidat.

On peut choisir les règles manuellement sans inventer l’enseigne :

```bash
.venv/bin/python -m backend.cli.extract_receipt data/receipts/images/recu_metro.png \
  --profile metro --output data/receipts/extractions/recu_metro.json

.venv/bin/python -m backend.cli.extract_receipt chemin/vers/recu.png \
  --profile generic --output data/receipts/extractions/recu_generique.json
```

Sans `--profile`, la détection est automatique. Le choix forcé et les éventuels conflits avec l’enseigne détectée sont signalés dans `warnings`.

## Extension du contrat en version 1.1

Tous les profils utilisent le **même schéma**, avec les champs précédents et ces ajouts :

- `parsing_profile` : règles effectivement utilisées.
- `adjustments` : montant signé, ligne source, effet `applied`, `informational` ou `unknown`. « Applied » décrit le calcul proposé, pas une confirmation par l’utilisateur.
- `totals.calculated_subtotal` : somme des articles plus les ajustements appliqués connus ; `null` si des montants nécessaires manquent.
- `totals.tax_check_status` : comparaison indépendante entre sous-total imprimé + taxes lues et total imprimé.

`items_sum` conserve son sens : somme des montants de produits connus, avant ajustements séparés. `difference_from_subtotal` compare désormais le sous-total calculé après ajustements au sous-total imprimé. Les ajustements informatifs ne sont pas soustraits. Les consommateurs de la version 1.0 doivent donc tenir compte de ce changement explicite de version ; aucune route HTTP ni application mobile ne consomme encore ce contrat dans le dépôt.

Même si les calculs coïncident, une ligne d’achat non interprétée empêche le statut arithmétique `matches`. Les statuts restent des contrôles arithmétiques, pas une preuve de complétude ou d’exactitude OCR.

## Vérification historique des deux reçus après séparation des règles

Les blocs OCR déjà obtenus ont été rejoués avec les nouveaux profils, sans changer le texte reconnu ni effectuer de correction manuelle :

| Reçu | Profil | Résultat |
| --- | --- | --- |
| Maxi | `maxi` | 13 lignes ; somme et sous-total de 46,66 CAD, contrôle concordant |
| Metro | `metro` | 6 lignes de produits, dont une ligne de 3 framboises ; somme avant rabais membre de 34,44 CAD |

Pour Metro, les économies positives de 3,32 et 9,66 CAD restent informatives. Dans ce rejeu historique, l’OCR a lu **−8,99 au lieu de −0,99 CAD** pour le rabais membre. Le JSON conserve cette lecture : sous-total calculé de 25,45, sous-total imprimé de 33,45 et écart de **−8,00 CAD**, avec `arithmetic_status: mismatch`. La relecture ciblée Tesseract ajoutée depuis reconnaît −0,99 ; voir les vérifications et la validation du 4 octobre ci-dessus. Elle ne corrige pas rétroactivement ces captures ni la lecture Vision.

Les taxes lues sont 0,50 + 1,00 = **1,50 CAD**. Le contrôle fiscal est indépendant et concorde : 33,45 + 1,50 = **34,95 CAD**. Le code ne corrige pas le rabais en utilisant ce résultat ou le récapitulatif de fidélité ; une relecture reste nécessaire.

Les sorties actualisées se trouvent dans `data/receipts/`. Leur provenance `saved_ocr_replay` indique le rejeu ; le délai de ce rejeu ne mesure pas le temps de l’OCR. Les tests synthétiques couvrent aussi les formats inconnus, choix forcés, indices ambigus, taxes dupliquées et ajustements illisibles.

## Reçus sans rayon et descriptions coupées — 29 septembre 2026

Le profil générique prend maintenant en charge les montants finaux précédés de `$`, les descriptions avec un complément sur une seconde ligne et les rabais de lot explicitement signés (`3 pour … -$1.00RT`). Le symbole monétaire ne reste plus dans le nom du produit. `INTERAC` marque le début des paiements.

Dans une ligne structurée quantité/prix comportant deux montants monétaires, un séparateur OCR comme `e`, `&` ou `0` à la place de `@` est toléré avec avertissement. Aucun chiffre de quantité ou de prix n’est corrigé. Si le détail est illisible mais le montant final est lisible, ce dernier est conservé avec `quantity_detail_unreadable`, sans inventer quantité ou prix unitaire. Les lignes sources originales restent présentes même lorsque la description est assemblée.

Comparaison sur les blocs Vision des deux nouvelles images, rejoués avant et après modification :

| Image locale | Avant | Après |
| --- | --- | --- |
| `recu-nouh.png` | 15 articles, somme 51,20 $ | 27 articles, somme avant rabais 103,48 $ ; contrôle non vérifiable |
| `recu-nouh2.png` | 2 articles, somme 4,98 $ | 13 articles, somme avant rabais 54,25 $ ; net 51,97 $ après −1,38 $ et −0,90 $, égal au sous-total |

Le premier reçu comporte une lecture `-$O.45RT` : le montant du rabais reste inconnu, même si une relecture de l’image suggère −0,45 $. Le complément `31t` reste non interprété. Les sorties sont dans `data/receipts/extractions/recu-nouh.json` et `data/receipts/extractions/recu-nouh2.json` ; les OCR de diagnostic sont `nouh-before.ocr.json` et `nouh2-before.ocr.json`. Ces fichiers ne sont pas ignorés par Git ; vérifier et masquer les informations privées avant publication. Les JSON d’extraction sont dans `data/receipts/extractions/`, et les diagnostics `nouh-before*` et `nouh2-before*` dans `data/receipts/archives/`.

La concordance du second sous-total ne confirme pas les noms ni tous les détails : un prix unitaire du pain est illisible, et une ligne pesée porte un avertissement de multiplication incohérente. Les dates mal reconnues restent inconnues. Une photo plus nette, cadrée sur le papier, reste utile pour ces caractères ; aucun nouveau prétraitement d’image ni moteur OCR n’a été ajouté pour cet ajustement.

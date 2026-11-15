# Formats de vente et bases tarifaires — étape 6

**Date : 14 novembre 2026.** Cette étape prépare les données du moteur d’achats.
Elle ne calcule ni panier, ni nombre de paquets, ni comparaison de magasins.
Référence : [plan des listes](SHOPPING_LISTS.md#52-produits-admissibles).

## Ce qui est livré

- `backend/app/catalog/sales.py` : normalisation déterministe de chaque référence,
  vérification des attestations, classification des inconnues et rapports.
- `normalize_catalog` lit le catalogue commun ; `normalize_database` effectue
  une seule lecture groupée de `product_offer`, sans mutation, commit ou rollback.
- `backend/cli/normalize_sales.py` : audit JSON ou PostgreSQL, date explicite,
  attestations facultatives et rapport JSON autonome. Le mode base ouvre une
  transaction `REPEATABLE READ`, en lecture seule.
- Deux schémas exportés : `sale-reviews.schema.json` et
  `sale-normalization-report.schema.json`. Ils décrivent des documents serveur,
  sans ajouter de route HTTP ni de champ dans les réponses de Promos.

Aucune nouvelle dépendance ni migration n’est nécessaire. La révision reste
`0017_shopping_lists`, appliquée à Supabase le 14 novembre 2026, avant cette
étape. Le format source `source_unspecified` n’est pas réinterprété silencieusement.

## Trois questions séparées

1. **Quel est le contenu du conditionnement ?** Une indication « 1 kg » peut
   fournir un format candidat, sans prouver que le prix porte sur ce paquet.
2. **Sur quelle quantité porte le prix ?** Par paquet, par poids ou par nombre
   de pièces : le dénominateur doit être attesté. Un tarif au kg ne vaut pas
   le prix d’un paquet de 1 kg ou d’un poids inconnu.
3. **Le produit convient-il à cet ingrédient et à cette portée commerciale ?**
   La correspondance proposée du catalogue, un nom ou un identifiant commun ne
   certifient pas la variante, la substituabilité ou la portée magasin/enseigne.

`eligible_for_calculation` vaut vrai uniquement si **tous** les contrôles sont
satisfaits. L’existence d’un prix ou d’un format lisible ne suffit pas. Cette
admissibilité concerne l’exploitation technique des données attestées ; elle
n’est ni une garantie de stock ni une vérification automatique de la véracité
d’une attestation manuelle.

## Quantités et prix

Toutes les entrées numériques sont des chaînes décimales. Les quantités sont
strictement positives et les montants peuvent être nuls. Les flottants,
notations exponentielles, `NaN`, valeurs infinies et booléens ne deviennent pas
des quantités valides.

| Conversion certaine | Résultat normalisé |
| --- | --- |
| `kg` | grammes, facteur 1000 |
| `g` | grammes |
| `L`, `l`, `mL`, `ml` | millilitres ; facteur 1000 pour les litres |
| `lb` | grammes, facteur exact 453,59237 |
| `unit`, `un`, unités et `ea` dans les quantités de vente | pièces |
| `oz`, `fl oz`, plages, libellés promotionnels et unités non reconnues | inconnus ; aucune conversion inventée |

Le parseur existant `parse_format` est réutilisé pour les formats fixes et les
poids variables. Il accepte notamment `2 × 125 g`, `1,5 L` et `12 unités`. Les
multiplications passent par des fractions exactes puis un décimal fini, sans
perte liée à la précision globale de `Decimal`. Les conversions de recettes
(tasse, cuillères) ne prouvent pas un conditionnement commercial.

Un format complexe comme `2 × 4 × 125 g` reste inconnu ; une preuve vérifiée
peut fournir sa représentation simple, sans que le programme l’infère du nom.
La valeur brute de l’attestation et la source initiale restent conservées.

### Paquet (`package`)

- Contenu net fixe et explicitement vérifié obligatoire.
- Le prix porte sur **un paquet**, avec `price_per_quantity=null`.
- `content_per_package` décrit son contenu, distinct du nombre de paquets.
- Pas et minimum de vente sont un paquet ; une autre contrainte reste bloquée.
- Exemple fictif : `2 × 125 g` représente 250 g par paquet vendu, et non deux
  paquets achetables séparément au prix affiché.

### Poids (`weight`)

- Mode de vente au poids explicitement vérifié ; pas de poids de paquet inventé.
- `price_per_quantity` contient le poids tarifaire en grammes : par exemple
  1000 g pour un tarif au kilogramme, ou 453,59237 g pour un tarif à la livre.
- Pas et minimum de vente connus, compatibles avec les grammes et entre eux.
  Le minimum doit être un multiple entier du pas attesté.
- Un conditionnement fixe payé au poids reste hors de ce premier modèle : il
  ne devient pas du vrac librement divisible.
- Un dénominateur en litres ne couvre pas des grammes sans densité attestée.

Le montant du tarif reste entier dans sa base : aucun calcul de prix par gramme
ni arrondi monétaire n’est fait ici. L’étape 7 utilisera montant et dénominateur
ensemble pour calculer une ligne d’achat et son arrondi final.

### Nombre de pièces (`count`)

- Quantité tarifaire en pièces, distincte du prix d’un carton.
- Pas et minimum entiers, positifs, connus ; aucune fraction de vente implicite.
- Le format vérifié doit exprimer des pièces et correspondre au pas de vente.
- Exemple fictif : prix pour deux pièces, vente à la pièce : dénominateur deux,
  pas et minimum un. Un carton de douze vendu au prix du carton relève de
  `package`, avec douze pièces de contenu par paquet.

Les limites promotionnelles de `SourceProduct` portent sur des unités de vente
entières. Leur application à une vente mesurée au poids ou par pièces n’étant
pas attestée dans ce modèle, ces cas limités sont explicitement exclus.

## Attestations et provenance

Une attestation `SaleReview` est une entrée serveur explicite, fournie dans un
fichier `sale-reviews-1.0`. Elle ne provient jamais automatiquement d’un LLM,
d’un rapprochement par nom ou de l’existence d’un prix.

Champs principaux :

| Champ | Rôle |
| --- | --- |
| `product_id`, `ingredient_id` | Référence commerciale et correspondance exacte contrôlée |
| `source_fingerprint` | Empreinte SHA-256 de cet instantané commercial et de son ingrédient |
| `checked_at` | Horodatage avec fuseau du contrôle |
| `method` | `source_document` ou `manual_review` |
| `reference` | Document, lien ou justification consultée |
| `format_raw` | Libellé de format effectivement contrôlé |
| `price_basis`, `price_basis_raw` | Base tarifaire structurée et libellé justificatif |
| `price_per_quantity` | Quantité portant le tarif au poids ou au nombre |
| `sale_increment`, `minimum_sale` | Contraintes de vente effectivement connues |
| `match_status` | `verified`, `proposed` ou `rejected` ; vérifie aussi la variante |
| `scope` | `store`, `retailer` ou `unknown` ; magasin exige un identifiant source |
| `conditions` | Seul `unconditional` est pris en charge ; membre, coupon et multiachat restent bloqués |
| `zero_price_verified` | Confirmation explicite d’un montant nul, distinct d’un prix manquant |

Une attestation peut être incomplète : elle reste conservée avec des motifs de
blocage. Renseigner `price_basis` ne transforme pas les autres champs absents en
preuves. Les unités inconnues ou incompatibles ne sont pas corrigées par défaut.

L’empreinte inclut nom/variante, prix et conditions, format source, dates,
enseigne, magasin, provenance et correspondance. Les photos sont exclues : leur
modification ne change pas le contenu commercial. Une modification commerciale
rend l’attestation **stale**, conserve sa provenance et bloque son utilisation.
Les représentations textuelles source font partie de l’empreinte ; même une
réécriture décimale différente impose un nouveau contrôle de l’instantané.

Une preuve pour un autre produit ou ingrédient devient **identity_mismatch**.
Un manifeste dupliqué ou visant une référence absente de la source demandée est
refusé, plutôt qu’ignoré. Une preuve ne se réutilise pas arbitrairement sur une
référence d’une autre enseigne, d’un autre magasin ou d’une autre variante.

Le résultat conserve `raw_source` intégral, `review`, `source_fingerprint`, les
statuts, les quantités normalisées, les bases de prix et les motifs de blocage.
Le rapport JSON conserve aussi les empreintes des fichiers d’origine du catalogue
commun ; le mode PostgreSQL conserve la provenance commerciale de chaque ligne.
Il ne contient jamais l’URL de connexion à la base ou ses identifiants.

## Dates, promotions et inconnues

Le prix applicable est évalué à la **date des courses** fournie, selon les règles
existantes de `promotion` et `purchase_total` :

- Promotion confirmée active avec prix promotionnel : montant promo et palier
  éventuellement connu sont transmis, sans calculer le coût d’achat.
- Promotion expirée, future ou non vérifiable : prix régulier connu uniquement.
- Aucun régulier connu : prix inconnu. Le prix après limite ne devient jamais
  un régulier de secours après expiration.
- Prix nul : blocage tant que son caractère explicite n’est pas attesté.
- Prix absent : la référence et son format restent présents, avec `PRICE_UNKNOWN`.

Aucune lecture ne déclenche de collecte ni d’import. « À vérifier » ne signifie
ni « absent du magasin » ni « coût nul ».

## Exécuter l’audit

Depuis la racine, environnement Python activé :

```bash
# Source JSON, sans réseau et sans écriture dans les fichiers d’origine.
python -m backend.cli.normalize_sales \
  --on-date 2026-11-14 --output /tmp/optimeal-sales.json

# Source PostgreSQL configurée, transaction cohérente en lecture seule.
python -m backend.cli.normalize_sales --source database \
  --on-date 2026-11-14 --output /tmp/optimeal-sales-db.json

# Avec attestations déjà contrôlées ; ce fichier n’est pas généré automatiquement.
python -m backend.cli.normalize_sales \
  --reviews /chemin/attestations.json \
  --on-date 2026-11-14 --output /tmp/optimeal-sales-reviewed.json

python -m backend.cli.export_shared_contracts --check
```

Sans `--on-date`, la date du jour à Toronto est affichée dans le bilan et le
rapport. Utiliser une date explicite pour un audit reproductible. Le programme
refuse d’écraser le catalogue, les fichiers bruts référencés ou les attestations.
Il valide les attestations avant de créer une connexion et ne produit pas de
rapport de succès partiel si une validation échoue.

Les fonctions de lecture ne changent pas la transaction de leurs appelants :
le futur service de comparaison pourra les utiliser dans son propre instantané.
Le lecteur PostgreSQL réutilise le même adaptateur `SourceProduct` que Promos ;
les tests contrôlent l’égalité des résultats JSON/base et les identités publiques.

## Résultat du catalogue actuel et suite

Au 14 novembre 2026, sans nouvelles attestations : **93 références conservées**,
**90 formats candidats**, **3 formats inconnus**, **0 référence admissible au
chiffrage**. La base tarifaire, la portée, les conditions et les correspondances
restent à vérifier. Ce résultat empêche la certification automatique des
correspondances proposées ou des valeurs `source_unspecified` du catalogue.

Les tests utilisent des attestations **fictives et locales** pour exercer les
cas vérifiés. Ils ne certifient aucun produit réel. Aucun fichier source ni
prix réel n’a été corrigé pendant cette étape.

L’étape 7 peut maintenant consommer les références techniquement admissibles,
calculer quantités d’achat, combinaisons et paliers, et conserver explicitement
les besoins non chiffrables. L’interface reste à **Estimation indisponible**
jusqu’au raccordement de ce moteur.

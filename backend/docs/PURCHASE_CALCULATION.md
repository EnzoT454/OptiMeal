# Calcul des achats — étape 7

Le moteur interne `backend/app/shopping_lists/purchases.py` calcule les achats
couvrant un besoin d'ingrédient, par magasin. Il ne modifie aucune liste ni
aucun achat. Les routes et le panneau de comparaison sont raccordés depuis
[l’étape 8](SHOPPING_COMPARISONS.md). Le détail des courses et les coches restent
à réaliser à l’étape 9. Sans références attestées, le coût reste inconnu.

## Entrées et résultat

`calculate_coverage(ingredient_id, quantities, sales, on_date, owned=...,
purchased=..., reserved_units=..., limits=...)` reçoit :

- toutes les quantités du même ingrédient dans la liste, sous forme de
  `ShoppingQuantity` ; ne pas l'appeler séparément pour chaque contribution ;
- les références `NormalizedSale` de l'étape 6, avec leurs sources et preuves ;
- la date des courses et, éventuellement, les quantités possédées ou achetées ;
- `reserved_units`, nombre de paquets déjà affectés au même produit dans la
  portée de la promotion courante. Le futur service doit établir ces valeurs
  depuis les achats enregistrés, pas depuis un identifiant libre du mobile.

Les quantités compatibles sont additionnées exactement, puis les couvertures
déjà déclarées sont soustraites, avec un plancher à zéro. Les unités suivent
les conversions du projet. Un besoin sans quantité retourne `unquantified` ;
des dimensions incompatibles retournent `incompatible_units`, sans achat inventé.
Une couverture déjà suffisante retourne `already_covered`.

Le résultat conserve l'ingrédient, la date, l'unité, le besoin restant, les
références exclues et leurs motifs, puis les résultats par enseigne/succursale :

- `complete` : achats couvrants, coût CAD et surplus ;
- `no_eligible_product` : aucune référence admissible dans nos données ;
- `search_limit` : recherche trop grande, sans prix ou proposition approximative.

`best` désigne le meilleur résultat complet **parmi les références admissibles**,
sans répartir le même besoin entre plusieurs magasins. Il reste absent si un
magasin dépasse les bornes de recherche. L'absence de résultat ne prouve ni
l'absence de stock ni l'impossibilité d'acheter. Un produit sans prix ou preuve
reste dans les diagnostics ; il ne devient pas gratuit.

Chaque ligne conserve l'instantané normalisé et sa preuve, le contenu acheté
dans l'unité canonique, le montant, et `sale_units` : nombre de paquets pour
une vente conditionnée, nombre de pas de vente pour une vente mesurée.
`estimated_weight` signale que le poids effectivement payé peut varier.

## Quantités, tarifs et arrondis

Les références sont renormalisées à la date demandée depuis leur source et
leur attestation. Le moteur ne fait pas confiance à un ancien booléen
d'admissibilité. Un doublon d'identité produit est refusé : l'appelant doit
choisir l'instantané courant plutôt que multiplier les limites promotionnelles.

Pour un paquet fixe, acheter `ceil(besoin / contenu)` paquets. Pour des formats
interchangeables attestés, plusieurs références peuvent couvrir ensemble le
besoin. Pour le poids ou les pièces vendues par pas, respecter le minimum et
le pas attestés. Le coût mesuré utilise le dénominateur tarifaire exact :
`prix × quantité achetée / quantité tarifaire`.

Les paquets réutilisent `catalog/pricing.purchase_total` : promotion active
aux bornes incluses, limite partagée et tarif après limite. Hors promotion,
seul le régulier connu s'applique. Les ventes mesurées avec limite non attestée
restent exclues par l'étape 6. Membre, coupon et multiachat non pris en charge
ne deviennent pas des tarifs universels.

Quand des paquets sont déjà affectés, le coût supplémentaire est la différence
entre les coûts de la quantité cumulée et de la quantité réservée, arrondis
par référence. Sans état connu d'utilisation de la promotion, un besoin
partiellement acheté exclut les produits limités (`PROMOTION_USAGE_UNKNOWN`).
Les instantanés et montants historiques des achats ne sont pas réécrits.

Les calculs intermédiaires utilisent des fractions exactes de nombres décimaux,
y compris sous un contexte Decimal de faible précision. Arrondi **HALF_UP au
centime par produit regroupé**, puis somme entière des centimes. Les taxes et
consignes inconnues ne sont pas incluses. Le coût est une estimation d'achat,
pas un montant effectivement payé ni une garantie de budget.

## Recherche exacte et bornes

Les références sont triées par identifiant stable et regroupées par magasin.
Pour une référence de contenu/pas `q`, il suffit de chercher de zéro jusqu'à
`max(minimum de vente, ceil(besoin / q))`. Au-delà, retirer un pas, ou l'achat
minimal entier, conserve la couverture sans augmenter le coût. Les tarifs
acceptés sont non négatifs et non décroissants, y compris après limite.

La référence ayant le plus d'options sert de complément : pour chaque combinaison
des autres références, seul son plus petit achat couvrant le reste est utile.
Un achat supplémentaire ne réduit pas le coût et augmente le surplus. Cela
supprime une dimension d'énumération ; le cas à un format est un calcul direct,
même pour un million de paquets. Les coûts regroupés, incluant leurs paliers,
sont mémorisés pour les quantités réellement consultées.

Les combinaisons restantes sont exhaustives dans ce domaine. Départage : coût
arrondi, surplus exact, nombre de références, identifiants puis quantités.
Les valeurs par défaut de `SearchLimits` sont : **12 références admissibles par
magasin**, **10 000 options par référence énumérée**, **100 000 combinaisons par
magasin**. Les bornes sont vérifiées avant allocation des tableaux d'options.
Une limite dépassée renvoie `search_limit`, sans approximation annoncée optimale.
Ces limites bornent le travail algorithmique, pas une durée réelle garantie
sur chaque machine. Il n'y a ni appel réseau, ni collecte, ni écriture SQL.

## Validation

Les tests `backend/tests/test_shopping_list_purchases.py` couvrent paquets,
formats mixtes, poids, minimums, pas, dates, limites partagées, usage antérieur,
prix zéro attesté, preuves périmées, unités incompatibles, limites de recherche
et stabilité du départage. Deux oracles indépendants comparent les résultats
à une énumération plus large : 35 jeux avec promotions par paliers et 15 jeux
mêlant paquets, ventes mesurées, minimums et arrondis.

```bash
python -m pytest backend/tests/test_shopping_list_purchases.py -q
```

Le catalogue réel reste soumis aux attestations de l'étape 6. Les preuves
positives des tests sont fictives et ne rendent pas ses 93 références
automatiquement admissibles. Les futurs services de comparaison devront
conserver les choix manuels, établir les consommations de limites dans la liste
entière et vérifier la fraîcheur avant application ; ce raccordement reste à faire.

*Dernière mise à jour : 16 novembre 2026.*

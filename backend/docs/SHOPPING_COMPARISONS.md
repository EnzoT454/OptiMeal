# Comparer et appliquer les achats — étape 8

Le détail du nouvel onglet Liste permet de comparer **Maxi, Metro, Super C et
Moins cher**. Une simulation est privée et ne change ni la liste, ni ses achats,
ni sa révision. **Appliquer cette proposition** enregistre explicitement une
répartition et une nouvelle révision. Les listes partielles restent utilisables,
avec un sous-total connu et leurs besoins non chiffrés.

## Installation et données

Appliquer la migration `0018_shopping_comparisons` après `0017`, depuis la
racine du projet et avec la configuration de la base cible :

```bash
python -m alembic -c backend/alembic.ini upgrade head
```

Cette étape a été testée sur PostgreSQL local jetable. **La migration 0018
n'a pas été appliquée à Supabase pendant ce développement.** Elle ajoute trois
tables privées : simulations, choix manuels par article et instantané de la
répartition courante. RLS reste activée sans accès métier direct du mobile.
Les simulations sont immuables ; les répartitions sont conservées aussi dans
les révisions de la liste. Le retour à 0017 refuse d'effacer des choix ou
répartitions existants. Les comptes et listes supprimés nettoient ces tables
par cascade.

Les données commerciales suivent `OFFERS_SOURCE` : JSON commun chargé au
démarrage, ou PostgreSQL, sans repli silencieux. Les attestations de l'étape 6
peuvent être fournies côté serveur avec `SALE_REVIEWS_PATH`, chemin d'un fichier
`sale-reviews-1.0` relatif à la racine du dépôt ou absolu. Sans ce fichier,
aucun produit n'est automatiquement attesté. Un fichier configuré invalide ou
absent produit 503, jamais une estimation vide annoncée réussie.

```dotenv
# backend/.env — facultatif ; ne pas fabriquer de preuves pour obtenir un prix.
SALE_REVIEWS_PATH=
```

Redémarrer FastAPI après un changement de configuration. Chaque nouvelle
comparaison relit les attestations du fichier configuré et les valide contre
les instantanés commerciaux. Le client n'envoie jamais de preuve ou de prix.
Le catalogue réel reste donc non chiffrable tant que les contrôles commerciaux
requis ne sont pas fournis. Les données positives des tests sont fictives.

## Routes livrées

Toutes les routes sont privées sous `/api/v1/shopping-lists` :

| Route | Effet |
| --- | --- |
| `POST /{id}/comparisons` | Lecture de la liste et des sources ; enregistrement d'une simulation privée de 15 minutes ; aucune mutation des achats ou révision |
| `POST /{id}/apply-comparison` | Application atomique d'un scénario de cette liste ; clé `Idempotency-Key` et révision attendue |
| `PUT /{id}/items/{item_id}/choice` | Fixer un produit par son identité stable, ou transmettre `null` pour revenir au choix automatique ; nouvelle révision |

L'application reçoit uniquement :

```json
{
  "expected_revision": 4,
  "comparison_id": "00000000-0000-4000-8000-000000000010",
  "scenario": "cheapest",
  "accept_partial": false
}
```

`scenario` vaut `maxi`, `metro`, `superc` ou `cheapest`. Aucun montant client
n'est accepté. Une proposition partielle demande `accept_partial: true` après
confirmation. Le service vérifie propriétaire, appartenance de la simulation,
révision source, expiration, empreinte des besoins et empreinte des sources
commerciales et preuves. Une proposition devenue ancienne reçoit
`409 COMPARISON_STALE`, une confirmation manquante `409 COMPARISON_PARTIAL`.
Une liste modifiée reçoit le conflit de révision habituel.

La répartition, la révision et le résultat idempotent sont écrits dans la même
transaction. Le verrou du profil sérialise les commandes du compte ; le verrou
de liste fige ses besoins lors de la comparaison. Deux applications concurrentes
ne créent pas deux révisions à partir du même état. Une répétition avec la même
clé retrouve son résultat avant toute vérification de fraîcheur des sources.

## Calcul et choix manuels

Les articles non retirés sont regroupés par ingrédient canonique avant calcul,
y compris les lignes ajoutées séparément. Les quantités et couvertures sont
transmises ensemble au moteur de l'étape 7 : deux contributions au même produit
ne donnent pas deux limites promotionnelles. Un produit correspondant à plusieurs
ingrédients demandés rend le catalogue ambigu et bloque la comparaison.

Chaque scénario conserve les besoins, leurs articles sources, leurs achats
proposés et les instantanés commerciaux avec preuves. Il distingue besoin
couvert, déjà disponible, acheté sans prix connu, sans quantité, non chiffrable,
choix manuel introuvable et recherche dépassant ses bornes. Le coût connu et
les totaux par magasin sont calculés côté serveur, sans flottants JavaScript.
Les achats déclarés déjà effectués sont conservés et ne reçoivent pas un prix
rétroactif ; leur montant inconnu empêche d'annoncer un total complet.

Moins cher choisit, pour chaque besoin, un achat couvrant complet dans un
magasin parmi les références admissibles. Il ne fractionne pas ce besoin entre
plusieurs magasins pour multiplier les remises. Les magasins peuvent différer
entre ingrédients ; les déplacements ne sont pas inclus. La liste n'est pas
annoncée globalement optimale sous des contraintes géographiques ou un nombre
maximal de magasins, qui gardent leurs propres travaux.

Un choix manuel fixe le produit et donc son magasin. Les autres scénarios le
conservent avec une indication lorsqu'il sort de l'enseigne simulée. Un produit
absent, non attesté ou non chiffrable reste choisi, sans alternative appliquée
silencieusement. Des choix incompatibles sur deux lignes du même ingrédient
restent à résoudre explicitement. Le mobile permet de revenir au choix
automatique par article, puis de comparer à nouveau. Les quantités d'achat
librement modifiées et le parcours de courses viennent à l'étape 9.

Bornes du comparateur : 60 besoins regroupés, 1 000 références sources,
10 000 combinaisons par magasin et au plus 100 000 combinaisons effectivement
énumérées dans une comparaison. Les bornes du moteur restent applicables.
Un calcul trop grand est signalé sans approximation annoncée minimale.

## Lecture et parcours mobile

Le détail affiche la répartition enregistrée et ses montants sans consulter
les prix actuels. Renommer la liste conserve cette répartition. Modifier les
besoins, la date, une possession, un achat ou un choix manuel conserve son
instantané mais le signale ancien ; une nouvelle comparaison est explicite.
Les anciennes révisions restent lisibles avec leurs montants d'origine.

Les segments du panneau Comparer changent uniquement l'affichage local.
Une confirmation est demandée avant d'appliquer une proposition partielle.
Les commandes réutilisent la reprise persistante par compte de l'étape 5.
Les doubles appuis sont bloqués. Les réponses de comparaison tardives après
changement de compte ou de révision sont ignorées. Si le serveur a une révision
plus récente que l'écran, celui-ci demande d'actualiser la liste.

Les avertissements, états vides et erreurs restent visibles. Une panne ne
produit pas une comparaison gratuite. Les coches, achats partiels avec produit
et fiches détaillées de courses restent à réaliser à l'étape 9 ; le cache hors
connexion complet et la bascule d'Accueil/Calendrier gardent les étapes suivantes.
Les simulations expirées deviennent inapplicables ; leur purge physique reste
un travail de maintenance, sans suppression de l'historique des listes.

## Vérifications

Les tests couvrent les droits HTTP et les prix client refusés, l'absence de
mutation en comparaison, les paliers partagés, les choix manuels et leur retour
automatique, les sources obsolètes et l'expiration, les achats déjà effectués,
le sous-total partiel, l'annulation de transaction et les applications concurrentes.
Les tests mobiles exercent les vrais événements du panneau, les quatre segments,
la confirmation partielle et les réponses tardives. Les exemples exportés sont
vérifiés contre les types TypeScript. Validation complète : **892 tests backend réussis, 14 OCR opt-in ignorés**,
**193 tests mobiles réussis**, TypeScript, **32 exports de contrats** et bundles
Expo iOS/Android/web réussis. La documentation se construit en mode strict.
Lint mobile non configuré. Les essais manuels sur iOS et Android restent à
consigner séparément.

*Dernière mise à jour : 16 novembre 2026.*

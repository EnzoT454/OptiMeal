# Comparer et appliquer les achats — étape 8

## Recalcul unique des prix — 16 novembre 2026

Le détail affiche directement les produits et prix enregistrés, y compris les
achats déjà effectués (visibles par défaut et masquables). Les anciens boutons
**Comparer les magasins** et **Comparer les achats**, leur panneau et le service
mobile d’application d’une comparaison sont retirés. Une seule action
**Recalculer les prix** enregistre le nouveau panier après une action explicite.
Les modifications d’articles signalent que les prix sont à recalculer ; aucun
minuteur ni synchronisation automatique n’est ajouté.

Le recalcul partage la fonction de prix directs et d’arrondi supérieur avec la
création. Il déduit les possessions et quantités achetées avant de choisir les
produits du complément. Le magasin/scénario choisi et les préférences de produits
sont conservés. Les limites promotionnelles tiennent compte des unités déjà
achetées. Un montant absent reste inconnu ; le coût d’un achat déclaré sans prix
n’est pas déduit du catalogue actuel.

Les achats produits, leurs quantités, prix, allocations et identités sont conservés
sans réévaluation. Le budget devient achats connus déjà enregistrés + complément
nouvellement chiffré ; le reste à acheter ne contient que ce complément. Retirer
un article ne supprime pas le coût de ses achats passés. Les cartes distinguent
les quantités/montants encore à acheter de ceux effectivement enregistrés.
Les confirmations sans quantité sont rattachées uniquement aux articles auxquels
au moins une unité de vente a été allouée ; un achat partiel n’acquitte pas toutes
les lignes d’un groupe. Un même état cible d’achat conserve son instantané exact.

**Le prendre ailleurs** ouvre directement les alternatives du complément de
l’ingrédient concerné. Le choix ou le retour au choix automatique est enregistré
avec le recalcul dans une seule transaction, en passant au panier Moins cher.
Les achats de l’ancien magasin restent conservés.

API privée : `GET /shopping-lists/{id}/price-options` sans écriture, enveloppe
`Detail[ShoppingDraftPricingRead]` ; `POST /shopping-lists/{id}/recalculate-prices`
avec `Idempotency-Key`, `expected_revision`, scénario facultatif et changements
facultatifs de produits par article (`product_id=null` pour le choix automatique).
Le serveur calcule tous les prix ; il n’accepte aucun montant client. Les sous-totaux
connus sont enregistrés avec leurs besoins sans prix explicitement signalés.
Conflits, erreur de catalogue et choix invalides annulent la transaction. Une
réponse incertaine se reprend manuellement avec sa clé exacte, sans recalculer
les prix lors du rejeu.

Le mobile n’appelle plus les anciennes routes comparisons/apply-comparison,
qui restent disponibles côté serveur pour compatibilité. Aucune migration ni
dépendance supplémentaire ; backend et mobile doivent être déployés ensemble.


Validation du recalcul : **993 tests backend réussis** dans la suite complète,
14 essais OCR opt-in ignorés, puis **14 contrôles ciblés réussis**, dont deux
nouveaux cas (quantités mixtes et HTTP privé), soit 995 tests distincts vérifiés.
**252 tests mobiles réussis**, TypeScript, 47 exports de contrats, bundles Expo
iOS/Android et documentation stricte vérifiés. Aucun lint mobile configuré.
PostgreSQL local jetable uniquement, arrêté après vérification. Essais sur
appareils à consigner ; aucun changement distant ou migration.

Les sections ci-dessous gardent leur contexte historique.

## Création en deux étapes et prix directs — 16 novembre 2026

Ce parcours remplace la création en une étape décrite dans les notes précédentes.

1. **Ingrédients** : nom et date, saisie manuelle ou calendrier. Les quantités du
   calendrier se modifient directement ; les besoins peuvent être retirés et des
   articles ajoutés. **Suivant** calcule les prix sans enregistrer de brouillon.
2. **Prix par magasin** : Maxi, Metro, Super C, puis **Moins cher** en dernier.
   Toucher une carte affiche les produits exacts. Le panier Moins cher les
   regroupe par magasin. Toucher un produit ouvre les alternatives ; choisir un
   autre produit/magasin recalcule le panier Moins cher. Les totaux propres à une
   enseigne restent distincts de cette personnalisation. **Précédent** conserve
   les ingrédients et permet de corriger la saisie avant un nouveau calcul.
3. **Créer la liste** confirme le panier sélectionné et enregistre la liste active,
   ses besoins et ses prix ensemble. Il ne s’agit pas d’une troisième page.
   Aucun minuteur, cache de liste ou historique des versions n’est réintroduit.

### Calcul demandé

- Sans quantité : prix direct d’un produit. Avec quantité : nombre entier de
  produits arrondi au supérieur, puis coût de ces produits. Exemple : 750 g,
  format 500 g à 3 $ → 2 produits, total 6 $. Une quantité exactement divisible
  n’ajoute pas de produit. Les calculs utilisent des décimaux/fractions exacts.
- Les besoins d’un même ingrédient se regroupent avant l’arrondi et les limites
  promotionnelles. Plusieurs lignes sans quantité demandent chacune un produit.
- Le prix direct utilise le prix régulier ou la promotion valide à la date des
  courses, avec son prix après limite. Le moins cher minimise le total à acheter,
  et ne compare pas seulement les prix affichés d’un produit de chaque format.
- Le format doit correspondre à la dimension demandée pour convertir des g/ml.
  Un nombre de produits utilise l’unité de vente lorsque le format n’est pas
  exprimé en pièces. Aucun prix ou format absent n’est inventé : le besoin reste
  sans prix, et un panier incomplet exige une confirmation explicite.
- Le calcul direct conserve la source et son statut de vérification. Il ne
  transforme pas une référence sans attestation en référence vérifiée. Le moteur
  historique de couverture attestée reste distinct pour les autres parcours.

### API et persistance

`POST /api/v1/shopping-lists/creation-prices` est privé et sans écriture. Il reçoit
les ingrédients/quantités, la date et les choix par indice. Il retourne les quatre
scénarios, les produits alternatifs, leurs prix/nombres à acheter et une empreinte.
Un nom libre est relié au catalogue uniquement si son nom ou alias exact donne
une identité unique ; les noms inconnus restent sans prix.

Les créations manuelle/calendrier acceptent `pricing` (empreinte, scénario, choix,
confirmation d’un sous-total) ; le calendrier accepte aussi `adjusted_items`.
Le serveur relit le catalogue et recalcule les montants : aucun prix client n’est
accepté. Prix, besoins ou choix différents de l’empreinte → conflit et annulation
complète, sans liste partielle. La reprise idempotente ne relance pas le calcul.
Les achats produits conservent ces prix directs et couvrent aussi les besoins
sans quantité avec une confirmation liée au besoin courant ; une décoche annule
leur couverture et rétablit le montant restant.

Aucune migration ni dépendance supplémentaire. Le backend doit être déployé avec
le mobile pour les nouveaux contrats. Supabase n’est pas modifié par ce travail.

Les sections précédentes ci-dessous gardent leur contexte historique.

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
a été appliquée et vérifiée sur Supabase le 16 novembre 2026**, depuis 0017.
La révision est confirmée sur une nouvelle connexion après commit et le schéma
correspond aux modèles Alembic. Les empreintes et comptages des 18 tables
applicatives préexistantes et le nombre de comptes Auth sont conservés.
Elle ajoute trois
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
automatique par article, puis de comparer à nouveau. Les quantités d’achat et le parcours de courses sont livrés dans
[l’étape 9](SHOPPING_COURSES.md).

Bornes du comparateur : 60 besoins regroupés, 1 000 références sources,
10 000 combinaisons par magasin et au plus 100 000 combinaisons effectivement
énumérées dans une comparaison. Les bornes du moteur restent applicables.
Un calcul trop grand est signalé sans approximation annoncée minimale.

## Lecture et parcours mobile

Depuis l’étape 9, les comparaisons incluent les estimations des achats produits
déjà effectués (`purchased_known_amount`), sans les réévaluer. Les achats
déclaratifs sans prix restent inconnus.

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
et fiches de courses sont livrés à [l’étape 9](SHOPPING_COURSES.md) ; le cache hors
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

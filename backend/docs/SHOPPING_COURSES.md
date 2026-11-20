# Parcours de courses — étape 9

> **Note historique de réalisation.** Les sections datées ci-dessous décrivent
> les étapes et validations initiales. Pour les écrans actuels, consulter le
> [guide des listes](SHOPPING_GUIDE.md) et les [contrats courants](SHOPPING_LISTS_CONTRACTS.md).
> La tête Alembic est 0023, contrôlée sur la base configurée le 20 novembre 2026 ;
> les mentions de révisions antérieures ou d’absence de lint décrivent ces anciens essais.
> Le lint est désormais configuré ; voir le [guide mobile](../../mobile/README.md#vérifier-le-code-avec-eslint).

Le nouvel onglet Liste permet de cocher les achats, déclarer une possession
partielle ou totale, modifier les besoins et terminer les courses. Les calculs
restent côté serveur. L’ancienne Épicerie de Calendrier et les accès Accueil
conservent leur fonctionnement jusqu’aux étapes 13–14.

## Installation

La migration **0019_shopping_courses**, après 0018, ajoute
`shopping_list_product_purchase` : une table privée avec RLS, sans politique
d’accès direct du mobile. La suppression du compte ou de sa liste nettoie les
achats par cascade. Le retour à 0018 refuse d’effacer des achats existants.
Les anciennes révisions restent lisibles avec une collection d’achats produits
vide par défaut ; elles ne sont ni réécrites ni réévaluées.

```bash
python -m alembic -c backend/alembic.ini upgrade head
```

**0019 a été appliquée et vérifiée sur Supabase le 16 novembre 2026**, depuis
0018, après les tests PostgreSQL locaux. La révision est confirmée sur une
nouvelle connexion après commit ; `alembic check` ne détecte aucun écart avec
les modèles. RLS active, aucune politique mobile, deux clés étrangères et index
attendu vérifiés. Les empreintes et comptages des **21 tables préexistantes**
et le nombre de comptes Auth sont conservés. La nouvelle table est vide.
Aucun fichier `.env` n’a été modifié.

## Parcours mobile

1. Créer ou reprendre une liste. L’ajout d’article reste accessible par un
   bouton ; le formulaire se déplie à la demande.
2. Comparer les magasins, puis appliquer explicitement une proposition.
   Les produits sont regroupés par magasin puis rayon. Le filtre de magasin
   ne change que l’affichage.
3. Toucher une case **Acheté** enregistre un état cible. Pour un produit, la
   case confirme les unités de vente proposées. Toucher le reste de la ligne
   ouvre une fiche défilante : besoin, provenance, quantités disponibles et
   achetées, produits, formats, estimations et conditions connues.
4. Dans la fiche, enregistrer le nombre réellement acheté pour un achat
   partiel ou supérieur à la proposition. Les paquets sont entiers. Une vente
   mesurée utilise les pas et le minimum attestés, affichés dans la fiche.
5. **J’en ai déjà** remplace la possession déclarée pour cette liste, avec une
   quantité par dimension ou une confirmation pour un besoin sans quantité.
   Cette possession est annulable et ne crée aucune exclusion globale.
6. Un achat sans produit peut être déclaré, même sans prix. Sa quantité est
   distincte des achats produits ; la déclaration remplace la précédente.
   Une coche sans quantité confirme uniquement la révision du besoin consulté.
7. Modifier le besoin conserve les achats effectués. Les compléments deviennent
   visibles ; une nouvelle comparaison prépare leurs achats. Changer de produit
   ou revenir au choix automatique passe par une nouvelle proposition explicite.
8. Les achats enregistrés restent consultables et décochables dans une section
   repliable, y compris après une nouvelle comparaison. Un article retiré reste
   restaurable. Les actions de liste secondaires sont dans **Options de la liste**.
9. Une liste active peut être terminée ; les besoins restants demandent une
   confirmation explicite. Une liste terminée est consultable et peut être
   rouverte. Modèles, copie et interface d’historique restent à l’étape 10.

Les champs de formulaire et erreurs restent visibles après refus. La reprise
persistante réutilise la même clé, méthode et corps. Les doubles appuis sont
bloqués. Une réponse d’un ancien compte ou parcours ne remplace pas le courant,
et une ancienne révision rejouée ne remplace pas une révision plus récente.
Ce comportement ne constitue pas un mode hors connexion complet (étape 11).

## Contrats HTTP

Routes privées sous `/api/v1/shopping-lists`, `Idempotency-Key` obligatoire
pour les mutations ; réponse `Detail[ShoppingListRead]` complète.

| Route | Corps / comportement |
| --- | --- |
| `PUT /{id}/product-purchases` | `expected_revision`, `comparison_id`, `item_id`, `product_id`, `purchased_units` |
| `PUT /{id}/items/{item_id}/manual-purchase` | Achat déclaratif existant, sans produit ni montant |
| `PUT /{id}/items/{item_id}/possession` | Couverture disponible existante, `{}` pour annuler |
| `POST /{id}/complete` | `expected_revision`, `accept_remaining=false` par défaut |
| `POST /{id}/reopen` | Réouverture d’une liste archivée ou terminée |

Un achat produit est identifié par proposition, groupe de besoins et produit.
Le serveur retrouve la ligne appliquée et son instantané ; le client ne peut
fournir ni format, ni preuve, ni prix, ni couverture inventée. Le nombre d’unités
est un entier entre 0 et 1 000 000 ; zéro décoche. Pour une ligne regroupant
plusieurs articles, le produit est acheté une seule fois. Sa couverture est
répartie dans l’ordre enregistré, en conservant le surplus sur le dernier
article. Les allocations déjà enregistrées restent stables si le même nombre
est confirmé après une modification du besoin.

La création d’un nouvel achat exige une proposition actuelle. Un achat déjà
enregistré reste modifiable depuis son ancien instantané. Une confirmation
sans quantité devenue ancienne ne couvre pas un nouveau besoin quantifié.
Une quantité sous le minimum de vente reçoit 422 `SALE_MINIMUM` ; une clôture
sans confirmation des besoins restants reçoit 409 `COURSES_REMAINING`.
Droits, révision, commande, couverture et historique sont vérifiés/écrits dans
la même transaction avec les verrous de profil et de liste existants.

## Estimations et stabilité

`product_purchases` expose instantané de ligne, unités achetées, couverture par
article et `estimated_amount`. Ce montant reste une estimation, jamais un prix
de caisse. Les achats sans prix ne deviennent pas chiffrés rétroactivement.
Les compteurs de progression viennent des quantités effectivement couvertes,
pas des produits simplement proposés.

Pour une proposition actuelle :

```text
budget connu = estimations des achats effectués + reste connu à acheter
```

Une coche produit diminue le reste, sans changer le coût prévu du panier ni
les magasins. Un dépassement volontaire de la quantité prévue peut augmenter
son coût. Une nouvelle comparaison conserve les achats passés avec leur prix
figé et calcule les compléments ; les unités déjà achetées du même produit
consomment sa limite promotionnelle. La comparaison expose aussi
`purchased_known_amount` et inclut ces achats dans ses sous-totaux par magasin.

Une modification du besoin, d’une possession ou d’un choix rend la proposition
ancienne. Les estimations des achats effectués sont conservées ; les compléments
non chiffrés restent signalés. Décocher un ancien achat utilisé pour préparer
une nouvelle proposition rend cette dernière ancienne à son tour.
Les formats, prix et correspondances non attestés restent inconnus : les
références positives des tests sont fictives. Taxes, consignes et déplacements
non documentés restent exclus.

## Validation

Tests des transactions, accès privés, reprises idempotentes, écritures concurrentes,
achats groupés, surplus, poids/minimum, couvertures mixtes, changement de besoin,
confirmations sans quantité, tarifs après limite, conservation des prix,
clôture/réouverture et annulation atomique. Les tests mobiles exercent les
événements des cases, fiches, champs, filtres et sections repliables.

**Résultats finaux : 918 tests backend réussis, 14 essais OCR réels ignorés**
car opt-in ; **203 tests mobiles réussis**, TypeScript, **34 exports de contrats**,
bundles Expo **iOS/Android/web** et documentation stricte réussis.

Les essais manuels iOS/Android et l’accessibilité sur appareils restent à
consigner. Les bundles et tests automatisés ne les remplacent pas. Le lint
mobile n’est pas configuré ; aucune dépendance n’a été ajoutée.

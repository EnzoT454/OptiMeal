# Listes d’épicerie — contrats du lot A

**Date : 14 novembre 2026.**  
**Statut : routes du lot A et parcours mobile disponibles ; migration 0017 appliquée et vérifiée sur Supabase le 14 novembre 2026.**

Ce document précise l’étape 2 du [plan des listes](SHOPPING_LISTS.md).
Il fixe les échanges du premier lot et les invariants de persistance. Les
opérations HTTP ci-dessous sont raccordées à FastAPI depuis l’étape 5. Le nouvel
onglet Liste permet création, aperçu calendrier et édition des brouillons.

## 1. Sources de vérité et périmètre

- [Schémas Pydantic](../app/shopping_lists/schemas.py) : formes et validations.
- [Registre et exemples](../app/shopping_lists/contracts.py) : ressources
  exportées, données de démonstration explicitement fictives, sans réseau.
- [Types mobiles](../../mobile/types/shoppingLists.ts) : consommateurs du lot A.
- [Exemples JSON](../contracts/v1/shopping-list-examples.json) : chaque exemple
  est validé par son modèle avant export ; un test vérifie sa compatibilité
  avec les types TypeScript.
- [Exporteur commun](../cli/export_shared_contracts.py) : production et contrôle
  des JSON Schema `shopping-*.schema.json`. L’OpenAPI exporté inclut les routes du lot A.

Le lot A couvre brouillons nommés, création manuelle ou depuis une période,
besoins, contributions, possession, achats manuels, révisions et commandes.
Il prépare la structure pour les lots suivants sans livrer le calcul des
paquets, les comparaisons, les modèles ou la synchronisation hors connexion.

Les schémas valident les entrées et la structure des sorties. Les droits,
l’existence des références, la couverture effectivement calculée, la sauvegarde,
l’idempotence et les transactions relèvent des services. Ceux du parcours manuel
sont implémentés et testés à l’étape 3 ; l’agrégation et l’aperçu calendrier le
sont à l’étape 4. La sauvegarde depuis cet aperçu et l’interface sont raccordées à l’étape 5.
Ne pas présenter un test de schéma comme un test de fonctionnement de ces services.

## 2. Conventions communes

Préfixe HTTP : `/api/v1`. Authentification : jeton Supabase vérifié par
`current_user`. Le propriétaire est déduit de `CurrentUser`, jamais du corps.
Toutes les ressources et références imbriquées sont privées.

Les quantités et montants sont des chaînes décimales sans exposant, signe
négatif, virgule ou valeur non finie. Les quantités renseignées sont strictement
positives ; le zéro appartient aux agrégats et aux prix connus, pas à un besoin.
Les révisions sont des entiers strictement positifs, jamais des booléens.
Les noms sont nettoyés des espaces de bord et limités à 120 caractères.

Les UUID sont des identifiants de liste, article, contribution, achat et commande.
Un identifiant canonique d’ingrédient conserve le format `ing_…`. Aucun nom libre
ne devient automatiquement une nouvelle entrée du référentiel.

Les dates sont des jours `YYYY-MM-DD`, sans heure. Les horodatages de réponse
doivent être émis en UTC par le service ; les modèles exigent un fuseau explicite.
Une date de courses omise ou nulle à la création est résolue une seule fois à
Toronto lors de la première exécution de la commande, puis conservée en reprise.
Une commande PATCH ne peut pas effacer cette date.

Réponses : `Detail[T]` ou `Page[T]`, avec les métadonnées existantes. Les listes
persistées utilisent `data_source=postgresql`, `dataset_kind=user_content`.
Une pagination initiale retourne les ressources complètes, sans requête de détail
obligatoire par carte. Une future projection légère devra être documentée.

## 3. Commandes, révisions et idempotence

### 3.1. En-tête et corps distincts

Chaque mutation reçoit `Idempotency-Key: <UUID>` en en-tête. Le modèle
`ShoppingCommandHeaders.idempotency_key` représente cette valeur après extraction
par la dépendance HTTP ; ce champ ne figure pas dans le corps métier.
Le mobile génère une clé une seule fois par intention et la conserve lors des
reprises, y compris après renouvellement de session sur 401.

Les créations utilisent `ShoppingListCreate` ou `ShoppingFromCalendar`, sans
`expected_revision`. La liste et son premier instantané sont créés en **révision 1**.
Une mutation d’une liste existante utilise `ShoppingCommand.expected_revision`.
Chaque nouvelle commande acceptée produit une révision suivante, même si elle
fixe un état déjà identique ; le rejeu de la même clé ne produit aucune révision.

### 3.2. Transaction implémentée à l’étape 3

Ordre fixé :

1. Vérifier le compte, l’accès à la liste éventuelle et l’état de suppression.
   Ne pas révéler une révision ou une clé d’un autre compte dans une erreur.
2. Rechercher la commande par compte et clé. Sa signature comprend méthode,
   chemin logique, identifiant de liste, version de contrat et corps validé,
   en conservant la différence entre champs omis et nuls.
3. Si même clé et même signature : retourner le résultat enregistré avant de
   rejeter une ancienne révision. Même clé et autre signature : conflit.
4. Sinon verrouiller la liste, vérifier `expected_revision`, appliquer la mutation
   et vérifier les invariants métier.
5. Enregistrer état courant, nouvelle révision et résultat de commande ensemble.

Les commandes de création concurrentes avec la même clé doivent aussi être
protégées par l’unicité `(compte, clé)` et une transaction ; ne pas créer deux listes
avant de découvrir le doublon. Garder les résultats de commande pendant la vie
de la liste et les supprimer avec le compte. Une réponse de reprise peut refléter
une ancienne révision : le mobile ne remplace pas un état plus récent par celle-ci
et peut relire la liste courante après confirmation de l’action.

Les futurs modèles référencent `profile`, dont la création idempotente existe.
Les mutations de listes devront refuser `deletion_pending` et se coordonner avec
le verrou de profil utilisé par la suppression de compte, sans changer la règle
de conservation des recettes publiques.

## 4. Besoins, contributions et édition

### 4.1. Entrée et normalisation

`ShoppingQuantity` contient `amount` et `unit`, parmi
`g`, `kg`, `ml`, `L`, `unit`, `cup`, `tbsp`, `tsp`. Une fraction de pièce peut
être nécessaire après ajustement de portions : elle reste une quantité de
cuisine, pas un nombre fractionnaire de paquets.

`ShoppingBaseQuantity` utilise uniquement `g`, `ml` et `unit`. Une liste de
quantités normalisées contient au maximum une quantité par unité. Masse, volume
et nombre restent distincts. Les conversions et l’agrégation sont réalisées
à l’étape 4, selon les équivalences du plan. Les fractions de portions sont
regroupées exactement ; seuls les résultats non finis sont arrondis par excès
à six décimales, avec `QUANTITY_ROUNDED`. Les décimaux finis restent exacts.

Le nombre de paquets d’un produit appartient au lot B ; `package` n’est pas
accepté comme unité de cuisine sans identité et format de vente explicites.
Le lot A accepte un article sans quantité, sans inventer un paquet implicite.

### 4.2. Ajout et modification

`ShoppingItemAdd` : révision attendue, nom, ingrédient éventuellement nul,
quantité éventuellement nulle, et `merge=add` par défaut ou `separate` explicite.
Un ingrédient canonique doit exister et être autorisé par le référentiel utilisé.
Le service ne le crée pas automatiquement lorsqu’un import d’ingrédients manque.

Pour `merge=add`, présenter la fusion à l’utilisateur puis ajouter la contribution
au besoin compatible. Un texte libre ne fusionne pas automatiquement par nom.
`separate` demande volontairement un autre article et ne doit pas être utilisé
silencieusement par le formulaire pour contourner les doublons.

`ShoppingItemUpdate` distingue :

- champ absent : aucun changement ;
- `quantity: null` : rendre le besoin non quantifié, après avertissement s’il
  remplace plusieurs composantes connues ;
- quantité renseignée : fixer le besoin de cette dimension, après normalisation,
  en conservant les autres dimensions ;
- `removed: true/false` : retirer ou rétablir l’article dans cette liste ;
- `name` : nouveau nom d’affichage, non vide et non nul.

Conserver les contributions sources lors d’un remplacement de besoin ; enregistrer
la correction manuelle pour qu’une future actualisation du calendrier ne la perde
pas. Chaque changement des quantités requises incrémente `need_revision` de l’article.
Renommer, cocher, retirer ou rétablir ne réattribue pas une ancienne confirmation
sans quantité à un nouveau besoin. Les modifications d’un article ne changent ni
la recette ni le repas source.

### 4.3. Lecture et provenance

`ShoppingItemRead` expose identité, catégorie figée, `need_revision`, quantités
requises/disponibles, contributions, retrait et états de couverture/chiffrage.
La provenance calendrier conserve UUID du repas, recette, nom, version, jour,
portions du repas, portions de base `recipe_servings`, quantité d’origine et
quantité ajustée normalisée. Le nom de recette n’est pas tronqué à la limite
des noms de listes. Une ancienne contribution manuelle sans `recipe_servings`
reste valide avec ce champ nul.

Les besoins agrégés ne sont pas reconstruits côté mobile à partir des valeurs
normalisées déjà arrondies des contributions : le calcul serveur additionne
leurs fractions exactes avant de représenter le total en décimal. Quantité
initiale et rapport de portions conservent les données de référence.

Une contribution manuelle n’a pas de faux lien calendrier. Les références
historiques des contributions sont des instantanés ; leur contrat ne doit pas
devenir invalide lorsque le repas ou la recette source disparaît de la base.
Préserver leurs identités d’origine dans l’instantané, même si les éventuelles
clés étrangères de consultation deviennent nulles.

## 5. Achat manuel et possession sans comparaison

### 5.1. Cocher un article sans produit ni prix

Le contrat fixé est `PUT /shopping-lists/{id}/items/{item_id}/manual-purchase`,
avec `ShoppingManualPurchaseWrite`. Un seul enregistrement d’achat manuel courant
existe par article. Le service crée son identifiant lors de la première commande.
La case envoie un **état cible**, jamais une instruction « inverser ».

```json
{
  "expected_revision": 4,
  "purchased": true,
  "coverage": { "confirms_unquantified": true }
}
```

Pour un besoin quantifié, transmettre `coverage.quantities`, par exemple
`[{"amount":"500","unit":"g"}]`, et non `confirms_unquantified=true`.
La couverture est la quantité déclarée achetée, même supérieure au besoin.
Le service vérifie sa dimension contre l’article ; ce n’est pas une conversion
devinée du format d’un produit.

Pour un article sans quantité, `confirms_unquantified=true` confirme seulement
le besoin tel qu’il était consulté. Le service enregistre sa `need_revision`
dans `confirmed_need_revision`. Une quantité ajoutée ultérieurement rend cette
confirmation ancienne ; la conserver, signaler la vérification et ne pas considérer
automatiquement le nouveau besoin comme acheté.

Décocher fixe `purchased=false` et `coverage={}`. L’article reste dans la liste.
Un achat manuel expose `product_id=null` et `estimated_amount=null` : aucune
preuve de produit ou de prix de caisse n’est déduite d’une coche. Le lot B ajoutera
une variante d’achat de produit avec instantané et unités de vente, sans recycler
un booléen d’ingrédient comme couverture quantitative.

### 5.2. Possession

`PUT /shopping-lists/{id}/items/{item_id}/possession` reçoit
`ShoppingPossessionWrite` et remplace la possession déclarée courante.
Quantités normalisées pour une possession partielle ou totale ; confirmation
sans quantité seulement pour un besoin non quantifié. Un corps `coverage={}`
annule la possession. Les achats enregistrés restent distincts.

Une confirmation de possession sans quantité est elle aussi liée à la révision
du besoin consulté. Les nouvelles exclusions globales ne sont pas implicitement
créées par cette commande.

## 6. Couverture et compteurs sans double comptage

Les règles du futur service sont fixées pour chaque article non retiré :

1. Si la possession seule couvre toutes ses dimensions : `owned`.
2. Sinon, si possession et achats couvrent ensemble toutes les dimensions :
   `purchased`, y compris la couverture mixte. Le détail conserve les deux parts.
3. Sinon, si une part du besoin est couverte : `partial`.
4. Sinon : `remaining`.

Pour un besoin sans quantité, appliquer les confirmations de la `need_revision`
courante, avec priorité `owned` si la possession le confirme ; les confirmations
anciennes ne couvrent pas le nouveau besoin. Une dimension incompatible reste à
vérifier et ne réduit pas une autre dimension par approximation.

Les agrégats forment la partition :

```text
item_count = remaining_item_count + purchased_item_count + owned_item_count
partial_item_count <= remaining_item_count
```

Les articles partiels appartiennent aux restants. Les lignes retirées ne comptent
dans aucune catégorie. `unpriced_item_count` compte les articles non possédés
dont l’achat n’est pas intégralement chiffré, même s’ils sont cochés.
`uncovered_item_count` compte les besoins non couverts par un achat effectif ou
une proposition couvrant leur quantité ; il n’est pas synonyme de prix manquant.

Le lot A ne livre aucun calcul de prix : montants connus à `"0"`, achats manuels
sans montant, et `estimate_complete=false` dès qu’un article non possédé ne peut
pas être chiffré. L’interface doit montrer **« Estimation indisponible »** lorsque
aucun achat n’a de prix, jamais « Courses gratuites ». Une liste vide ou entièrement
possédée peut avoir zéro besoin d’achat. Les budgets du lot B intégreront les achats
cochés ; un prix réel payé nécessitera une saisie ou une confirmation distincte.

Le contrôle de structure valide les partitions et leur accord avec les états
retournés ; il ne remplace pas le calcul des couvertures à l’étape 4.

## 7. Période, aperçu et création calendrier

`ShoppingCalendarPreviewWrite` reçoit début et fin inclusifs, et date des courses
facultative. `ShoppingFromCalendar` ajoute nom, empreinte SHA-256 de l’aperçu et
`accept_partial=false` par défaut. Aucun de ces corps ne contient de propriétaire
ou de révision de liste inexistante.

La réponse d’aperçu contient période, date des courses résolue, empreinte,
repas inclus, notes/restes ignorés, repas exclus et besoins proposés.
Une recette inaccessible est représentée par l’UUID du repas du compte et
`recipe_unavailable`, sans révéler le contenu privé d’une autre personne.

Le service d’aperçu utilise une session dédiée et une transaction PostgreSQL cohérente
en `REPEATABLE READ`, établies avant la première lecture métier. Il filtre
directement `MealPlanEntry` par compte et intervalle inclusif, réutilise
`visible(user_id)` et charge les ingrédients en lot. Pas de boucle HTTP vers
`/plans`, pas de modification nécessaire de cette route publique pour les listes.

L’empreinte canonique inclut version de calcul/contrat, compte, période, date des
courses résolue, exclusions, repas triés, portions, restes, droits observés et
recettes accessibles : version, nom et ingrédients/quantités/unités consultés.
Elle ne contient pas de donnée inaccessible. Recalculer cette empreinte lors
de la création dans une nouvelle transaction cohérente, et comparer à l’aperçu.

La copie représente le contenu observé dans cette transaction ; elle ne promet
pas qu’aucun autre utilisateur ne pourra modifier sa recette après cette lecture.
Un changement détecté donne `CALENDAR_PREVIEW_STALE`. Si la date des courses
avait été omise, le mobile renvoie la date résolue dans l’aperçu à la création,
pour ne pas changer de jour entre deux lectures autour de minuit.

L’étape 4 fournit `preview_calendar` et la vérification à blanc
`validate_calendar_preview`, qui ne sauvegardent aucune liste. La création de
l’étape 5 utilise `_read_validated_preview` dans sa propre transaction
d’écriture, avant d’enregistrer liste, commande et révision. Un résultat issu
d’une transaction de vérification déjà fermée ne suffit pas à sécuriser cette
sauvegarde. Les UUID de l’aperçu sont temporaires ; une nouvelle instance de liste
reçoit de nouveaux identifiants d’articles et de contributions.

Les erreurs de données accessibles, par exemple une recette sans ingrédient,
provoquent `CALENDAR_DATA_INVALID` (503) et non une exclusion silencieuse.
Une panne de lecture interrompt l’aperçu et libère sa transaction. Aucun appel
au catalogue marchand ou à un LLM n’est nécessaire pour cette étape.

Sans repas exploitable : erreur 422 avec code métier `NO_PLANNED_MEALS` et aucun
faux succès. Si certains repas sont exclus, la création exige `accept_partial=true`
et conserve un avertissement durable. Si tous les ingrédients de repas valides
sont exclus par préférence, l’aperçu l’explique et la création d’une liste vide
reste un choix explicite ; ne pas confondre cette situation avec une panne.

## 8. Surface HTTP du premier lot

Toutes les routes ci-dessous sont **à implémenter**. Les réponses de mutation
renvoient la liste complète mise à jour dans `Detail[ShoppingListRead]`, pour
permettre un seul état cohérent côté mobile. L’en-tête idempotent est requis
pour toutes les mutations persistantes, pas pour l’aperçu sans sauvegarde.

| Méthode et chemin, après `/api/v1` | Corps | Réponse et statut prévus |
| --- | --- | --- |
| `GET /shopping-lists` | Filtres `status`, `limit=20` (1–100), `offset=0` | `Page[ShoppingListRead]`, 200 ; tri `updated_at DESC, id` |
| `POST /shopping-lists` | `ShoppingListCreate` | `Detail[ShoppingListRead]`, 201, brouillon révision 1 |
| `GET /shopping-lists/{id}` | Aucun | `Detail[ShoppingListRead]`, 200 |
| `PATCH /shopping-lists/{id}` | `ShoppingListUpdate` | `Detail[ShoppingListRead]`, 200 |
| `POST /shopping-lists/calendar-preview` | `ShoppingCalendarPreviewWrite` | `Detail[ShoppingCalendarPreviewRead]`, 200, aucune liste créée |
| `POST /shopping-lists/from-calendar` | `ShoppingFromCalendar` | `Detail[ShoppingListRead]`, 201, brouillon révision 1 |
| `POST /shopping-lists/{id}/items` | `ShoppingItemAdd` | `Detail[ShoppingListRead]`, 200, ajout ou fusion atomique |
| `PATCH /shopping-lists/{id}/items/{item_id}` | `ShoppingItemUpdate` | `Detail[ShoppingListRead]`, 200 |
| `PUT /shopping-lists/{id}/items/{item_id}/manual-purchase` | `ShoppingManualPurchaseWrite` | `Detail[ShoppingListRead]`, 200 |
| `PUT /shopping-lists/{id}/items/{item_id}/possession` | `ShoppingPossessionWrite` | `Detail[ShoppingListRead]`, 200 |
| `POST /shopping-lists/{id}/activate` | `ShoppingCommand` | `Detail[ShoppingListRead]`, 200 ; brouillon vers actif |
| `POST /shopping-lists/{id}/archive` | `ShoppingCommand` | `Detail[ShoppingListRead]`, 200 ; brouillon/actif vers archivé |
| `POST /shopping-lists/{id}/reopen` | `ShoppingCommand` | `Detail[ShoppingListRead]`, 200 ; archivé vers actif |
| `GET /shopping-lists/{id}/revisions/{revision}` | Aucun | `Detail[ShoppingRevisionRead]`, 200 |

Le type de statut prévoit `completed` pour le futur lot C, mais le lot A ne
propose ni clôture définitive, ni modèle, ni comparaison. Une transition non
autorisée retourne 409 `LIST_STATE_CONFLICT`. L’édition courante concerne brouillons
et listes actives ; les archivés se rouvrent d’abord. Les chemins statiques
`calendar-preview` et `from-calendar` doivent être déclarés avant les paramètres
génériques susceptibles de les intercepter.

## 9. Révisions, erreurs et consommateurs

`ShoppingRevisionRead` contient identité de liste, numéro, commande à l’origine,
horodatage et instantané `ShoppingListRead` de la même identité/révision.
Conserver les états d’origine sans relire les noms ou prix courants pour les
remplacer. L’identité de commande n’est pas l’identité d’un achat ou d’une recette.

Les erreurs 401/404/422/503 conservent l’enveloppe commune. Les conflits de listes
utilisent `ShoppingConflictResponse`, avec `code`, `message`, `details`,
`list_id`, `expected_revision` et `current_revision` explicitement nullables
selon le cas. `LIST_REVISION_CONFLICT` exige les trois dernières valeurs.

L’adaptation HTTP de l’étape 3 devra préserver ces champs : le gestionnaire actuel
de `HTTPException` reconstruit un `ErrorResponse` et ne peut pas transporter
implicitement les champs supplémentaires. Renvoyer une réponse conforme pour
ces routes, ou étendre le gestionnaire de façon ciblée avec non-régression des
contrats existants ; ne pas laisser une erreur 409 devenir une erreur 500.

Le transport mobile sera étendu de façon additive pour conserver code, détails
et contexte, tout en gardant `status` et `message` pour ses consommateurs actuels.
La même commande et la même clé survivent à la reprise sur 401. Pas de nouvel
intercepteur d’authentification ou de second client HTTP.

Les futurs consommateurs sont fixés : création et détail dans la pile Liste,
liste épinglée dans Accueil, action de période depuis Calendrier, puis exclusions
depuis Paramètres au lot C. Leurs accès devront passer par identifiant et révision,
sans réutiliser implicitement les anciennes clés hebdomadaires globales.

## 10. Contrôles et limites de cette étape

Les tests de contrats couvrent types numériques, révisions strictes, périodes,
champs omis/nuls, achats sans prix, confirmations liées au besoin, partitions,
références internes, instantanés et contexte de conflit. Les exemples sont
exportés séparément des exemples historiques de Recettes et Promos.

```bash
python -m pytest backend/tests/test_shopping_list_contracts.py backend/tests/test_shared_contracts.py -q
python -m backend.cli.export_shared_contracts --check
# Depuis mobile/
npm run typecheck
node --test tests/shoppingListContracts.test.cjs
```

Les contraintes d’autorisation, les commandes simultanées et l’atomicité des
services manuels ont désormais leurs tests PostgreSQL à l’étape 3. La génération
des besoins calendrier, ses conversions et la cohérence de ses lectures sont
testées à l’étape 4. Les codes HTTP effectifs, l’isolation entre comptes et la création calendrier
atomique sont testés à l’étape 5. Aucun résultat ne valide un déploiement de
ces routes sur un serveur distant, une migration Supabase ou un parcours sur appareil.

Validation historique de l’étape 2 : **36 cas de contrats backend** ; suite backend
complète **465 réussis, 192 ignorés** ; **176 tests mobiles réussis**, dont le
contrôle croisé des exemples ; TypeScript, **27 exports** et construction stricte
de la documentation réussis. Les tests ignorés ne sont pas des validations.
Le projet ne configure pas de commande lint mobile. La CI mobile est également
déclenchée par les changements des exports `shopping-*.json`, afin de vérifier
leurs consommateurs même lors d’une modification des seuls contrats backend.

Validation de l’étape 4 au 14 novembre 2026 : **46 nouveaux cas de test** pour
l’agrégation et l’aperçu ; suite backend complète **720 réussis, 14 essais OCR
réels ignorés car opt-in** ; **176 tests mobiles réussis**, TypeScript, **27 exports**
et documentation stricte valides. Les routes et la sauvegarde depuis le
calendrier restent à raccorder à l’étape 5.

Validation de l’étape 5 : voir [le suivi du lot A](SHOPPING_LISTS.md#27-api-et-parcours-mobile--étape-5).
Le champ de suivi des exemples exportés vaut désormais `lot_a_implemented`.

Résultats finaux de l’étape 5 : **726 tests backend réussis, 14 OCR opt-in ignorés**,
**185 tests mobiles réussis**, TypeScript, 27 exports de contrats, exports Expo
iOS/Android/web et documentation stricte valides. Aucun essai sur appareil ni
application de migration à Supabase pendant cette étape.

L’étape 6 ajoute des documents serveur de [normalisation des ventes](SALE_NORMALIZATION.md),
sans changer les contrats HTTP du lot A ou de Promos. Les mentions de Supabase
non migré dans les validations des étapes précédentes sont historiques.

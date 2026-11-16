# Listes d’épicerie — référence et plan d’implémentation

**Date : 16 novembre 2026.**

**Statut : étapes 1 à 7 réalisées — lot A, normalisation et moteur de couverture disponibles ; étapes 8 à 15 à réaliser.**

**Les comparaisons, leur application et les parcours de courses des lots B/C restent à implémenter.**

Ce document est la référence de travail pour construire le nouvel onglet
**Liste** d’OptiMeal. Il reprend les parcours demandés, les deux captures
fournies et les incohérences observées dans la première liste mobile. Il doit
être relu avant chaque étape d’implémentation et actualisé lorsque le code,
les contrats ou une décision changent.

Les sections de suivi distinguent les éléments implémentés des propositions.
Une migration disponible dans le dépôt n’est pas automatiquement appliquée à
Supabase. Les routes et écrans cibles restent à développer, sauf mention
explicite. Les noms techniques sont une base de travail à confronter aux
conventions du dépôt ; les règles utilisateur et critères de validation doivent
être préservés.

Repères de lecture :

- [État initial et incohérences](#2-état-réel-au-début-du-travail).
- [Résultat de l’étape 1](#23-audit-de-létape-1--14-novembre-2026).
- [Résultat de l’étape 2](#24-contrats-fixés-à-létape-2--14-novembre-2026).
- [Résultat de l’étape 3](#25-persistance-et-services-privés--étape-3).
- [Résultat de l’étape 4](#26-agrégation-de-période--étape-4).
- [Résultat de l’étape 5](#27-api-et-parcours-mobile--étape-5).
- [Résultat de l’étape 6](#28-normalisation-des-ventes--étape-6).
- [Résultat de l’étape 7](#29-calcul-des-achats--étape-7).
- [Parcours et écrans](#4-navigation-et-écrans).
- [Calcul des besoins, paquets et prix](#5-agrégation-et-couverture-des-besoins).
- [Modèle de données](#6-modèle-de-données-proposé).
- [API et concurrence](#7-contrats-api-proposés).
- [Persistance et hors connexion](#8-persistance-mobile-interruptions-et-hors-connexion).
- [Étapes et lots](#11-ordre-de-réalisation-et-critères-de-passage).
- [Validation](#13-plan-de-validation).

## 1. Objectif et principes

Permettre de créer une liste à partir des repas d’une période ou manuellement,
de préparer les achats selon les formats et prix connus, de choisir où acheter,
puis de suivre les courses sans modification silencieuse des décisions.

Le parcours cible est :

```text
Liste → Créer → Calendrier ou saisie manuelle → Vérifier les besoins
→ Comparer les achats → Appliquer une proposition → Faire les courses
→ Terminer → Retrouver dans l’historique ou réutiliser
```

Règles structurantes :

1. Une liste possède sa propre identité et ses propres articles ; elle ne dépend
   pas implicitement de la semaine courante du téléphone.
2. Une liste issue du calendrier est une copie indépendante des besoins au
   moment de sa création. Les recettes et repas sources restent inchangés.
3. PostgreSQL est la source des listes enregistrées ; FastAPI vérifie les droits
   et calcule les besoins, achats, propositions et montants.
4. Accueil, Calendrier et Liste affichent les mêmes ressources et agrégats.
5. Consulter une comparaison ne modifie pas la répartition enregistrée.
6. Cocher un achat ne change pas les produits ni les magasins des autres achats.
7. Un choix manuel, une quantité achetée ou une exclusion ne disparaît pas lors
   d’une actualisation.
8. Un prix inconnu, un format ambigu ou une correspondance incertaine restent
   signalés. Ils ne valent ni zéro dollar ni produit indisponible en magasin.
9. Réutiliser crée une copie ; l’original et ses révisions restent consultables.
10. Les propositions automatiques n’utilisent aucune équivalence inventée par IA.

## 2. État réel au début du travail

### 2.1. Éléments disponibles

| Élément | État et réutilisation |
| --- | --- |
| Navigation | Cinq onglets : Accueil, Promos, Recettes, Calendrier, Liste. Paramètres s’ouvre par la roue dentée de l’accueil. |
| `mobile/app/ListScreen.tsx` | Écran volontairement vide ; point d’entrée à développer. |
| Calendrier | Repas privés persistants, portions, notes et restes ; lecture par semaine. |
| Première Épicerie | Présente dans Calendrier ; aperçu et ajout rapide dans Accueil. |
| `mobile/components/shoppingList.ts` | Chargement, agrégation mobile, prix simples et stockage local. Source à analyser et à remplacer progressivement. |
| `mobile/components/useShoppingList.ts` | État par compte, actions, erreurs de lecture et d’écriture. Comportements de protection à préserver. |
| `ShoppingListView.tsx`, `ArticleSheet.tsx`, `AddItemField.tsx` | Base visuelle et interactions à adapter aux nouveaux contrats. |
| `mobile/services/accountStorage.ts` | Clés locales isolées par compte et écritures ordonnées ; base possible du cache. |
| `backend/app/shopping_lists/` | À l’audit initial : fichiers réservés. Étapes 2–3 : contrats et services privés manuels. Étape 4 : aperçu et agrégation calendrier. Étape 5 : routes privées, sauvegarde depuis calendrier et interface du lot A raccordées. Calcul des achats à développer. |
| Catalogue | Identifiants canoniques, catégories, produits, magasins et prix ; certaines correspondances et certains formats restent à vérifier. |
| `backend/app/catalog/pricing.py` | `purchase_total` applique déjà un prix promotionnel limité à un nombre d’unités de vente ; ne calcule pas les paquets nécessaires. |
| PostgreSQL | Chaîne Alembic ; tête connue lors de la rédaction : `0016_offer_quantity_limits`. Vérifier la tête réelle avant toute nouvelle migration. |

### 2.2. Incohérences à corriger

| Problème actuel | Conséquence | Règle cible |
| --- | --- | --- |
| Liste toujours construite pour cette semaine | La semaine consultée peut différer de celle des achats | Période explicite et enregistrée |
| Un prix de paquet additionné par ligne | Sous-estimation si plusieurs paquets sont nécessaires | Calculer les unités de vente couvrant le besoin |
| Prix brut comparé entre formats | Un petit paquet peut sembler moins cher malgré un coût d’achat supérieur | Comparer les achats complets admissibles |
| Recommandation ignorant les choix manuels | Le magasin conseillé ne correspond plus au panier affiché | Proposition calculée avec les choix conservés |
| Recommandation recalculée après une coche | Les magasins changent pendant les courses | Affectations stables jusqu’à une action explicite |
| Pas de retour au magasin automatique | Choix manuel difficile à annuler | Retour automatique visible dans la comparaison |
| Ajout manuel séparé du même ingrédient planifié | Doublon et double comptage possibles | Fusion contrôlée des besoins compatibles |
| Articles manuels globaux, coches hebdomadaires | Un achat revient décoché la semaine suivante | Tout rattacher à une liste identifiée |
| Coche conservée après augmentation du besoin | Besoin supplémentaire masqué | Suivre les quantités couvertes et les compléments |
| « Total » excluant certains articles | Impression erronée de couverture complète | Sous-total et besoins non chiffrés explicites |
| Compteurs différents entre écrans | Progression difficile à comprendre | Agrégats communs retournés par le backend |
| Documentation annonçant toutes les listes comme futures | Confusion entre prototype local et cible persistante | Distinguer ces deux états dans les guides concernés |

### 2.3. Audit de l’étape 1 — 14 novembre 2026

**Étape réalisée :** relecture de cette référence, inspection du code des listes,
de ses consommateurs, des services métier réutilisables, des contrats et de la
chaîne Alembic. Cet audit ne livre aucune table, route, écran ou correction
fonctionnelle. Le périmètre de cette étape est l’état du dépôt local ; aucune
connexion à la base Supabase ou migration n’a été effectuée.

Le nouvel onglet est bien vide. L’ancienne Épicerie reste calculée dans le
mobile ; il n’existe ni liste persistante identifiée, ni modèle, ni révision
de liste, ni file durable de commandes de courses. Les fichiers réservés du
domaine backend ne contiennent que des docstrings. L’OpenAPI produit par
`create_app().openapi()` ne contient aucune route de listes.

#### Chaîne de migrations vérifiée

| Contrôle local | Résultat |
| --- | --- |
| `alembic heads` | Une tête : `0016_offer_quantity_limits` |
| Inspection de `ScriptDirectory` | 16 révisions, une base `0001_ingredients`, aucun point de branchement |
| `alembic branches` | Aucun résultat : aucune branche locale de migrations |
| `0016_offer_quantity_limits.down_revision` | `0015_permanent_public_recipes` |
| Métadonnées dans `backend/alembic/env.py` | Modèles catalogue, recettes, comptes et calendrier ; aucun modèle de listes |

Ces résultats portent sur les fichiers versionnés, pas sur la révision appliquée
dans la base distante. Avant l’étape 3, relire la tête réelle puis ajouter la
nouvelle migration à sa suite et enregistrer les modèles de listes dans les
métadonnées. Aucun numéro de migration futur n’est réservé par cet audit.

#### Consommateurs et dépendances à préserver

| Consommateur inspecté | Dépendances actuelles et conséquence pour la bascule |
| --- | --- |
| [Accueil](../../mobile/app/HomeScreen.tsx) | Instancie son propre `useListeAchats`, recharge au retour, affiche compteurs et montants, ajoute des articles ; ouvre Calendrier avec `vue=epicerie`. À raccorder à un identifiant de liste. |
| [Calendrier](../../mobile/app/CalendarScreen.tsx) | Autre instance du même hook, sans transmettre son lundi sélectionné. Recharge après modification de ses repas et rend `ShoppingListView`. Ne pas retirer ce parcours avant l’étape de bascule. |
| [Navigation](../../mobile/App.tsx) et [types](../../mobile/types/navigation.ts) | `Liste` pointe vers `ListScreen`, sans pile de listes ni paramètre de liste/période. L’accès Paramètres appartient déjà à la pile Accueil. |
| [Vue Épicerie](../../mobile/components/ShoppingListView.tsx) | Affiche les sections, fiches, prix et coches du hook ; son badge, ses filtres et le sens de son total devront utiliser les futurs agrégats serveur. |
| [Fiche d’article](../../mobile/components/ArticleSheet.tsx) | Reçoit une ancienne ligne avec ses offres et les actions du hook. Son identité est celle d’un ingrédient ou d’un ajout manuel, pas celle d’un article serveur. |
| [Champ d’ajout](../../mobile/components/AddItemField.tsx) | Suggestions d’ingrédients, prix indicatifs et ajout libre ; pas de saisie de quantité ni recherche de produits complète. |
| [Statuts et reprises](../../mobile/components/ShoppingListStatus.tsx) | Distingue erreur de lecture, erreur d’écriture et avertissement ; conserver cette distinction pendant la transition. |
| Tests mobiles | `shoppingListFailures`, `shoppingListStatus`, `localAccountIsolation`, `productIdentity`, `planningAvailability` et `visitorAccess` couvrent les comportements à préserver ou à adapter explicitement. |

Les deux écrans partagent du code et des clés de stockage, mais pas une instance
unique d’état React. Leurs lectures sont indépendantes. Le futur raccordement
doit rafraîchir la même ressource après mutation et éviter qu’un écran affiche
une ancienne valeur pendant qu’un autre a enregistré une modification.

#### Éléments réutilisables et limites exactes

| Élément inspecté | Réutilisable | Limite à traiter |
| --- | --- | --- |
| [Service calendrier](../app/planning/service.py) | `entries_of`, filtre par compte, `monday_of`, données de portions et de restes | `get_plan` lit une semaine. Le service de listes peut filtrer directement un intervalle SQL dans une session cohérente ; ne pas appeler l’API HTTP du backend depuis ce même backend. |
| [Service recettes](../app/recipes/service.py) | Prédicat `visible`, modèles d’ingrédients quantifiés, `content_version` | `entries_of` ne charge que nom et photo de recette ; il faut lire les ingrédients autorisés en lot et figer les contributions. |
| [Comptes](../app/accounts/service.py) et [sécurité](../app/security.py) | `CurrentUser`, vérification d’identité, création idempotente du profil | Définir les clés étrangères vers `profile` et le comportement des mutations pendant `deletion_pending`, en préservant la suppression existante du compte. |
| [Contrats communs](../app/common/contracts.py) | `ContractModel`, `DecimalText`, `Page`, `Detail`, `ResponseMeta` et erreurs structurées | Aucun schéma de liste, révision, proposition ou commande idempotente n’existe encore. |
| [Prix par palier](../app/catalog/pricing.py) | `purchase_total` en Decimal avec dates et limite | Reçoit un `SourceProduct` et un nombre entier d’unités de vente ; pas un `OfferRead`, ni un besoin de recette, ni un tarif de poids à appliquer sans adaptation. |
| [Formats](../app/catalog/formats.py) | `parse_format`, conversion fixe en g/ml/unit, lots et poids variable | Ne déduit pas à lui seul la base du prix. `2 x 500 g` est un format composé, pas une preuve que le prix s’applique à chaque sous-paquet. |
| [Données publiques](../app/common/public_data.py) | `today` en heure de Toronto, évaluation des promotions, adaptation JSON/PostgreSQL | Respecter la source configurée et conserver la provenance ; ne pas imposer une lecture des offres en base lorsque le serveur utilise JSON. |
| [Unités](../app/common/units.py) et [prix communs](../app/common/prices.py) | Emplacements prévus dans l’architecture | Modules encore vides : aucune conversion ni fourchette fonctionnelle à réutiliser dans ces fichiers. |
| [Stockage par compte](../../mobile/services/accountStorage.ts) | Isolation des clés et ordonnancement des écritures d’une clé | Ce n’est ni un cache de liste complète, ni une synchronisation réseau, ni une validation des JSON persistés à l’exécution. |
| [Transport HTTP mobile](../../mobile/services/api.ts) | Session, renouvellement sur 401, timeout et en-têtes additionnels | `ApiError` ne conserve que statut et message : étendre de façon compatible pour les codes, détails et informations de conflit. |

Le catalogue local validé contient **31 ingrédients et 93 produits**, soit
31 produits pour chaque enseigne. `mapping_status` vaut `proposed`, et les
93 offres HTTP exposent `format.basis=source_unspecified`. Ces comptages ne
prouvent ni les stocks, ni les prix courants, ni l’admissibilité automatique
des 93 références pour calculer des paquets.

L’identité commerciale est celle de `SourceProduct.id`, exposée en
`OfferRead.product_id`. La table `product_offer` conserve cette identité dans
sa colonne `id` ; l’`OfferRead.id` HTTP est une empreinte du relevé. Les futurs
choix ne doivent donc pas supposer que ces deux champs `id` ont la même portée.

#### Écarts supplémentaires constatés dans le prototype

Ces constats complètent le tableau 2.2 ; ils sont à traiter aux étapes prévues,
sans corriger le code pendant cet audit :

- `nombreOuNull` rejette les montants égaux à zéro. La cible distingue pourtant
  un zéro explicitement validé d’un prix inconnu ; les futurs contrats doivent
  garantir cette distinction sans interpréter un zéro ambigu comme gratuité.
- Un choix manuel dont le produit existe encore mais n’a plus de prix est
  remplacé à l’affichage par une offre par défaut. L’avertissement courant ne
  détecte que l’absence de référence, pas l’impossibilité de la chiffrer.
- La suppression du hook refuse les lignes non manuelles. Le nouveau contrat
  doit aussi permettre de retirer un besoin importé, sans toucher au calendrier.
- La validation clavier du champ d’ajout prend la première suggestion. La cible
  demande de conserver la saisie ou de faire choisir une correspondance ambiguë.
- La fiche n’a pas de contenu défilant et ferme certaines actions sans attendre
  leur enregistrement. Prévoir hauteur bornée, attente visible et reprise conservée.
- Le stockage ne conserve pas les quantités des articles manuels, ni l’état des
  courses sous forme d’achats identifiés : l’import ancien ne pourra pas
  reconstruire un panier historique exact. Ne pas inventer les quantités perdues.
- Le prototype utilise la date locale du téléphone ; le défaut de la route
  calendrier utilise la date du serveur. Les nouvelles commandes transmettront
  des dates explicites et fixeront le défaut des courses à Toronto côté backend.

#### Points à fixer à l’étape 2 avant le schéma

L’audit a repéré les précisions suivantes à apporter aux contrats proposés.
Elles ne bloquent pas la fin de l’étape 1 et ne constituent pas une demande
d’autorisation pour commencer la conception suivante :

1. **Achat sans produit connu :** le Lot A doit permettre de cocher un article
   libre même sans comparaison livrée. Définir un achat manuel avec produit
   nullable et couverture éventuellement non vérifiée, ou une commande de
   couverture explicite ; le seul endpoint portant un `purchase_id` calculé
   ne couvre pas ce besoin à lui seul.
2. **Création et révision :** une création n’a pas encore de `expected_revision`.
   Fixer la révision initiale et réserver le contrôle de révision aux ressources
   déjà créées ; conserver l’idempotence de la création.
3. **Compteurs mixtes :** choisir une règle unique pour un besoin entièrement
   couvert par possession partielle et achat partiel, afin de ne pas le compter
   deux fois ou de le laisser hors des compteurs. Séparer couverture et chiffrage.
4. **Période et cohérence :** fixer la lecture SQL d’un intervalle et l’empreinte
   des repas/recettes consultés. Réutiliser les prédicats d’accès, sans étendre
   inutilement le contrat public du calendrier ni multiplier les requêtes HTTP.
5. **Reprise HTTP :** fixer les champs d’erreurs et les informations nécessaires
   après conflit, ainsi que la conservation de la clé idempotente lors du
   renouvellement de session. Ne pas définir une seconde stratégie de session.

#### Vérifications exécutées et critère de passage

Commandes lancées depuis la racine, sans base distante :

```bash
python -m alembic -c backend/alembic.ini heads
python -m alembic -c backend/alembic.ini branches
python -m backend.cli.export_shared_contracts --check
python -m pytest backend/tests/test_offer_quantity_limits.py backend/tests/test_product_identity.py -q
node --test mobile/tests/localAccountIsolation.test.cjs mobile/tests/shoppingListFailures.test.cjs mobile/tests/shoppingListStatus.test.cjs mobile/tests/productIdentity.test.cjs mobile/tests/planningAvailability.test.cjs mobile/tests/visitorAccess.test.cjs
```

Résultats : **65 tests mobiles réussis**, **35 tests backend réussis et un
test PostgreSQL ignoré faute de base locale configurée**, et **11 exports de
contrats cohérents** avec catalogue et recettes valides. Les tests existants
sur identité, erreurs et isolation constituent une base de non-régression,
pas une validation des fonctionnalités futures. Les tests PostgreSQL ignorés,
le schéma distant et les appareils n’ont pas été validés dans cette étape.
La construction documentaire stricte et `git diff --check` réussissent aussi ;
les chemins locaux, ancres et trois exemples JSON du guide ont été vérifiés.

**Critère de passage satisfait :** état réel et consommateurs décrits,
réutilisation et écarts consignés, chaîne locale unique confirmée, aucune
migration ajoutée. La prochaine étape est la fixation des schémas et contrats
du Lot A, en résolvant les cinq points ci-dessus ; le Lot A reste incomplet.

### 2.4. Contrats fixés à l’étape 2 — 14 novembre 2026

**Étape réalisée :** schémas Pydantic dans `shopping_lists/schemas.py`, registre
et exemples validés dans `shopping_lists/contracts.py`, exports JSON Schema et
types TypeScript dans `mobile/types/shoppingLists.ts`. La référence précise des
champs, mutations, lectures et transactions est
[SHOPPING_LISTS_CONTRACTS.md](SHOPPING_LISTS_CONTRACTS.md).

Les cinq points de l’audit sont résolus au niveau des contrats :

| Point | Décision fixée pour le Lot A |
| --- | --- |
| Achat sans produit | Achat manuel privé par article, produit et prix nuls. Couverture quantifiée ou confirmation sans quantité liée à `need_revision`. Décocher fixe un état cible, jamais un toggle. |
| Création et révision | Création sans révision attendue, révision initiale 1 ; autres mutations avec `expected_revision`. UUID de commande en en-tête `Idempotency-Key`, conservé pendant les reprises. |
| Couverture mixte et compteurs | Possession seule suffisante : `owned` ; sinon possession et achats suffisants : `purchased` ; couverture incomplète : `partial`, inclus dans les restants. Les catégories forment une partition sans doublon. |
| Période et empreinte | Lecture SQL privée d’un intervalle inclusif dans une transaction cohérente ; empreinte des données réellement consultées, relue avant création. Aucun appel HTTP interne ni modification imposée au calendrier public. |
| Reprise et conflit HTTP | Schéma de conflit avec code, détails, liste et révisions ; reprise identique vérifiée avant conflit de révision. Adaptation ciblée du transport et du gestionnaire d’erreur à réaliser avec les routes. |

Les commandes et lectures distinguent champ omis et null explicite, unités
d’entrée et quantités normalisées, article retiré et article acheté, besoin
inconnu et prix inconnu. Une confirmation d’achat ancienne est conservée si le
besoin change, sans couvrir automatiquement sa nouvelle quantité.

Les formes sont testées ; le calcul métier, les droits en base, l’atomicité et
les reprises réseau effectives ne sont pas livrés par ces validations. Le Lot A
retournera « Estimation indisponible » avant le moteur de prix, sans présenter
la somme connue nulle comme des courses gratuites. Les types d’achats de produits,
comparaisons et modèles seront ajoutés lors de leurs lots, sans inventer de prix
dans l’achat manuel du premier lot.

L’exporteur produit désormais **27 fichiers cohérents**, dont les 15 schémas
préparatoires et leurs exemples séparés. Aucune route de listes n’a été ajoutée
à l’OpenAPI ; aucune table, migration ou modification de Supabase n’a été effectuée.
Le test mobile compare les exemples réellement exportés aux types TypeScript.

Validation de l’étape : **36 nouveaux cas de contrats**, **465 tests backend
réussis et 192 ignorés** sur la suite disponible, **176 tests mobiles réussis**,
vérification TypeScript et construction documentaire stricte réussies. Les
27 exports, liens locaux, ancres et exemples JSON ont été vérifiés. Aucun lint
mobile n’est configuré. Les tests ignorés, la base distante et les appareils
ne sont pas validés par cette étape.

**Critère de passage satisfait :** contrats et exemples du premier lot fixés,
invariants structurels testés, consommateurs et responsabilités des futurs
services explicités. La prochaine étape est l’étape 3 : modèles, migration et
services privés transactionnels ; le Lot A reste incomplet.

### 2.5. Persistance et services privés — étape 3

**Étape réalisée le 14 novembre 2026.** La migration
`0017_shopping_lists`, après `0016_offer_quantity_limits`, et les modèles
du premier lot sont disponibles. Ils ont été vérifiés sur un PostgreSQL 18
local temporaire en UTF-8. **Cette migration n’a pas été appliquée à Supabase.**
L’onglet Liste reste vide et aucune route de listes n’est exposée.

#### Organisation retenue pour le premier lot

| Table implémentée | Responsabilité |
| --- | --- |
| `shopping_list` | Propriétaire privé, nom, source/période, statut, date des courses, révision et horodatages |
| `shopping_list_item` | Identité stable par liste, ingrédient éventuel, nom/catégorie figés, retrait logique et révision du besoin |
| `shopping_list_quantity` | Quantités requises ou déjà disponibles, une ligne par article, nature et unité canonique |
| `shopping_list_contribution` | Provenance validée en JSONB et position ; indépendante de la disparition future d’un repas ou d’une recette |
| `shopping_list_purchase` | Achat manuel courant d’un article, état cible et éventuelle confirmation du besoin non quantifié |
| `shopping_list_purchase_quantity` | Quantités déclarées achetées par unité, sans produit ou prix inventé |
| `shopping_list_revision` | Instantané complet d’une révision et identifiant de sa commande |
| `shopping_list_command` | Clé idempotente par compte, signature et résultat enregistrés avec la liste |

La possession ne nécessite pas de table d’identité supplémentaire : ses
quantités sont dans `shopping_list_quantity` avec `kind=owned`, et sa confirmation
sans quantité dans l’article. Les modèles, exclusions et comparaisons des lots
suivants ne sont pas créés par anticipation.

Les huit tables ont RLS activée sans politique de lecture directe depuis le
mobile. Les quantités SQL sont positives et finies. Des clés étrangères composées
empêchent un achat d’appartenir à une autre liste et une commande de référencer
la liste d’un autre propriétaire. La suppression du compte retire ces données
par cascade. Les mises à jour des révisions et résultats de commandes sont
refusées par déclencheur ; leur suppression par cascade reste possible.
Le retour à `0016` est refusé tant qu’une liste existe.

#### Services disponibles et frontière avec les étapes suivantes

Dans `backend/app/shopping_lists/service.py`, les services privés couvrent :

- création manuelle d’un brouillon, lecture et pagination par propriétaire ;
- renommage et date des courses ; activation, archivage et réouverture ;
- ajout, fusion canonique contrôlée, modification et retrait logique d’articles ;
- possession totale/partielle, achats manuels et annulation par état cible ;
- classification de la couverture persistée, compteurs et avertissements ;
- lecture privée de chaque révision historique.

La normalisation d’une quantité manuelle utilise les conversions certaines
requises pour stocker les contrats du Lot A. Les dimensions incompatibles restent
distinctes, avec avertissement, sous le même article canonique lors d’une fusion.
Cette normalisation ne constitue pas la génération depuis une période de repas,
qui reste l’étape 4. Aucun paquet, prix ou magasin optimal n’est calculé ici.
Les montants restent non chiffrés et une coche ne crée pas un prix de caisse.

Chaque mutation utilise une session dédiée et possède son commit/rollback. Elle
verrouille d’abord le profil, puis la liste : ce choix sérialise les mutations
d’un même compte, y compris les créations, et les coordonne avec la suppression
du compte. Il est adapté au prototype ; les deux comptes restent indépendants.

Le rejeu d’une commande identique retourne le résultat enregistré avant de
vérifier une révision devenue ancienne. Les autres corps avec la même clé et
les révisions dépassées produisent une erreur structurée `ShoppingListError`.
État courant, commande et instantané sont enregistrés dans la même transaction ;
une erreur annule l’ensemble. Les lectures du service utilisent les instantanés,
sans reconstruire une liste depuis plusieurs états concurrents.

Les routes ne sont pas encore raccordées : `ShoppingListError` est une erreur
de service, pas une nouvelle réponse HTTP disponible. Le transport mobile et
la conversion des erreurs HTTP restent à raccorder avec les parcours concernés.
Le service reçoit un `CurrentUser` déjà vérifié ; il ne remplace pas Supabase Auth.

#### Validation et critère de passage

Les **31 nouveaux tests PostgreSQL** couvrent conformité Alembic, RLS, contraintes,
isolation de deux comptes, références imbriquées, historique, annulation atomique,
quantités exactes, besoins modifiés après achat, cascades et retour de migration.
Les tests sur connexions indépendantes vérifient créations simultanées, clés
rejouées avec un autre corps, révisions concurrentes, réponse perdue après commit
et coordination avec le verrou de suppression du profil.

La suite backend complète a réussi sur cette base locale : **674 tests réussis,
14 essais OCR réels ignorés car opt-in**. Les 27 exports de contrats restent
cohérents. La migration a été comparée aux métadonnées avec `alembic check` ;
les essais montée/retour et le refus du retour destructeur ont réussi.

Commandes de reproduction, avec une base locale jetable explicitement configurée
selon [MIGRATIONS.md](MIGRATIONS.md), depuis la racine :

```bash
python -m pytest backend/tests/test_shopping_list_storage.py backend/tests/test_shopping_list_concurrency.py -q
python -m pytest backend/tests -q
python -m backend.cli.export_shared_contracts --check
python -m alembic -c backend/alembic.ini heads
```

Ne pas lancer `alembic upgrade head` avec le fichier `.env` de la base partagée
pour reproduire ces tests. Les fixtures utilisent exclusivement
`OPTIMEAL_TEST_DATABASE_URL` vers un PostgreSQL local `optimeal_test_…` et annulent
leurs données. La révision locale attendue dans la chaîne du dépôt est désormais
`0017_shopping_lists` ; la révision de la base distante n’a pas été contrôlée.

**Critère de passage satisfait :** persistance du Lot A, services privés et
protections transactionnelles livrés avec leurs tests. La prochaine étape est
l’agrégation des besoins depuis une période de repas. Le Lot A reste incomplet
et l’application ne dispose pas encore du nouveau parcours de listes.

### 2.6. Agrégation de période — étape 4

**Étape réalisée le 14 novembre 2026.** Le module
[shopping_lists/calendar.py](../app/shopping_lists/calendar.py) calcule l’aperçu
des besoins d’une période. Les conversions certaines sont centralisées dans
[common/units.py](../app/common/units.py), également utilisé par les services
manuels. Aucune collecte, aucun appel IA et aucune nouvelle migration.

#### Fonctionnement livré

- `aggregate_period` est un calcul pur : filtres de dates inclusifs, portions,
  fusion des identifiants canoniques et contributions par repas.
- `preview_calendar` lit les repas du compte, réutilise le contrôle de visibilité
  des recettes et charge les ingrédients en lot. Deux requêtes métier suffisent,
  indépendamment du nombre de repas ; aucune boucle d’appels HTTP internes.
- Le lecteur possède une transaction `REPEATABLE READ` en lecture seule, dans
  une session dédiée sans transaction préexistante. Il libère cette transaction
  en sortie, y compris après une erreur, sans commettre de donnée.
- Les notes libres et restes sont comptés séparément. Les recettes inaccessibles
  ou supprimées sont signalées sans exposer leur contenu. Une recette accessible
  sans ingrédients est une erreur de données, pas un besoin vide présenté complet.
- L’aperçu est déterministe et lié au compte, à la période, à la date des courses,
  aux sources accessibles et à la version du calcul. Son empreinte change quand
  les portions, les quantités, le nom ou la version d’une recette changent.
- `validate_calendar_preview` vérifie à blanc l’empreinte et la confirmation
  d’un résultat partiel ; une source disparue depuis l’aperçu provoque un conflit
  avant toute sauvegarde. La date des courses résolue reste explicite au retour.

Les exclusions sont prises en charge comme entrée serveur du calcul pur, pour
préparer le lot C. Le lecteur actuel n’a aucune table de préférences à consulter :
il n’applique pas encore d’exclusions personnelles persistantes.

#### Précision et provenance

Les rapports de portions sont conservés comme fractions exactes pendant le
calcul. Les sommes sont regroupées par ingrédient et unité avant l’arrondi final.
Les décimaux finis gardent toute leur précision ; un résultat non fini comme
`2/3 g` est arrondi par excès à six décimales, soit `0,666667 g`.
L’avertissement `QUANTITY_ROUNDED` rend cette règle explicite.

Les quantités normalisées affichées de chaque contribution peuvent également
être arrondies pour leur représentation JSON. Elles ne doivent pas être sommées
par le mobile pour reconstruire le besoin : deux contributions de `1/3 g`
s’affichent chacune `0,333334 g`, mais leur besoin global vaut `0,666667 g`,
calculé sur les fractions originales. Les valeurs initiales, portions du repas
et **`recipe_servings`** conservent la provenance nécessaire à ce calcul.

Le champ `recipe_servings`, ajouté aux contrats et types TypeScript, est nul
pour une contribution manuelle et requis pour une nouvelle contribution calendrier.
Les anciens instantanés manuels restent lisibles. Le nom d’une recette source
est conservé intégralement, même au-delà de la limite des noms de listes.
Masse, volume et pièces ne sont pas fusionnés sans conversion certaine.

#### Frontière de l’étape et validation

Un aperçu n’est pas une liste enregistrée. Ses UUID déterministes sont temporaires ;
la création d’une instance devra attribuer de nouveaux UUID aux articles et
contributions, même si le même aperçu est utilisé deux fois. À l’étape 5, la
sauvegarde devra relire et valider les sources **dans sa transaction d’écriture**
avec `_read_validated_preview`, puis enregistrer la liste, la commande et sa
révision ensemble. Ne pas sauvegarder simplement le résultat d’une vérification
à blanc dont la transaction est déjà fermée.

Les **46 nouveaux cas de test** couvrent calculs manuels, bornes sur plusieurs
semaines, fractions, conversions, métadonnées, empreintes, visibilité, périodes
vides, import partiel, panne et modification concurrente entre les deux lectures.
Le test concurrent confirme qu’une recette et ses ingrédients proviennent du
même instantané ; la lecture suivante voit la nouvelle version complète.

Validation complète : **720 tests backend réussis**, **14 essais OCR réels ignorés
car opt-in**, **176 tests mobiles réussis**, TypeScript et **27 exports cohérents**.
La tête Alembic reste `0017_shopping_lists`. Supabase et les routes HTTP restent
inchangés ; aucun parcours sur appareil n’a été validé dans cette étape.

**Critère de passage satisfait :** agrégation privée et conversions vérifiées
contre les résultats attendus. La prochaine étape est l’étape 5 : raccorder les
services à l’API et construire l’accueil Liste, la création et l’aperçu dans le
mobile. Le Lot A reste incomplet jusqu’à cette livraison.

### 2.7. API et parcours mobile — étape 5

Le lot A est raccordé à FastAPI et au nouvel onglet **Liste**. La migration
`0017_shopping_lists` reste la tête du dépôt ; elle doit être appliquée à la base
cible avant d’utiliser ces routes. **Aucune migration Supabase n’a été appliquée
pendant cette étape.** Les essais utilisent exclusivement PostgreSQL local.

#### Parcours livré

- L’accueil Liste reste visible aux visiteurs, présente les deux façons de
  commencer et demande une connexion pour créer ou retrouver des listes privées.
- Un compte connecté voit ses listes paginées par 20, avec nom, état, nombre
  d’articles, progression et période éventuelle. Actualisation et chargement
  supplémentaire restent explicites ; aucune liste de démonstration n’est ajoutée.
- **Manuellement** : nom obligatoire, date prévue des courses, création d’un
  brouillon immédiatement enregistré dans le compte, puis ajout d’articles.
- **Depuis mon calendrier** : période initiale de la semaine courante, choix
  indépendant du premier et du dernier jour inclus et de la date des courses.
  Le sélecteur permet de parcourir les mois et de choisir une date lisible,
  sans saisie d’une chaîne ISO ni dépendance native supplémentaire pour les dates.
- L’aperçu montre les besoins et leur provenance, les repas inclus, les notes
  et restes ignorés, ainsi que les avertissements. Un résultat partiel exige une
  confirmation explicite. Modifier une date invalide l’aperçu affiché.
- La confirmation crée une **nouvelle liste indépendante**. Modifier ensuite
  le calendrier, une recette ou la période affichée ailleurs ne change ni ses
  articles, ni ses ajouts manuels, ni ses révisions sauvegardées.
- Le détail permet de reprendre un brouillon, renommer la liste, ajouter et
  modifier un article et sa quantité, retirer un article et le restaurer.
  Le retrait conserve l’article et sa provenance. Les besoins avec plusieurs
  dimensions restent affichés sans formulaire qui écraserait leur vecteur.
- Une quantité est facultative, strictement positive lorsqu’elle est fournie,
  avec une unité explicite. La virgule française est acceptée à la saisie.
  Sans quantité, l’écran indique **Quantité à préciser**, sans paquet inventé.
- Les lignes libres ne fusionnent pas par leur seul nom. Un nom déjà présent
  demande confirmation avant d’ajouter une ligne distincte. Les ingrédients
  canoniques transmis par l’API gardent les règles de regroupement du service.
- Le brouillon peut devenir actif par **Utiliser cette liste**. Les écrans de
  création/détail ont un retour natif et gardent les cinq onglets existants.

Les formulaires gardent leurs saisies après un refus serveur. Les commandes
sont enregistrées localement **avant envoi**, dans une clé propre au compte et
au parcours (création ou liste identifiée). Une réponse réseau incertaine bloque
les nouvelles modifications et propose **Reprendre l’enregistrement** : même
clé, même méthode, même corps. Cette reprise fonctionne aussi après fermeture
de l’application. Un refus explicite 404/409/422 libère le formulaire ; un
conflit de révision demande de relire la liste avec **Actualiser la liste** avant
de soumettre une nouvelle intention. L’API vérifie également que le compte
utilisé pour l’envoi est celui de la commande, y compris après renouvellement
du jeton. Les doubles appuis sont bloqués synchroniquement.

Cette reprise ciblée ne remplace pas le cache complet et le mode hors connexion
de l’étape 11 : une nouvelle écriture demande toujours le serveur. Un formulaire
jamais soumis n’est pas présenté comme un brouillon déjà enregistré.

#### Routes et atomicité

Les routes `/api/v1/shopping-lists` exposent lecture paginée, création manuelle,
aperçu calendrier, création depuis aperçu, lecture/modification d’une liste,
ajout/modification d’articles, possession, achats manuels, activation, archivage,
réouverture et lecture d’une révision. Chaque mutation exige un UUID dans
`Idempotency-Key` ; les commandes sur une liste exigent `expected_revision`.
Les droits viennent du jeton, jamais d’un identifiant propriétaire fourni dans
le corps. Les erreurs 409 conservent leur code et le contexte de révision.
Les schémas exportés et `openapi.json` décrivent les routes effectivement livrées.

`create_from_calendar` relit les sources et vérifie l’empreinte dans sa propre
transaction **REPEATABLE READ**, puis écrit liste, articles, quantités,
contributions, commande et révision atomiquement. Les identifiants temporaires
de l’aperçu sont remplacés par de nouveaux UUID pour chaque instance, y compris
lorsque deux listes utilisent le même aperçu. Les avertissements d’import sont
conservés dans les révisions, notamment après l’acceptation d’un import partiel.
Le verrou du profil sérialise les commandes d’un compte ; une annulation
PostgreSQL pour conflit de sérialisation est retentée au maximum trois fois,
avec la même clé. Une collision du registre idempotent issue d’un instantané
concurrent trop ancien est relue de la même manière. Un échec final produit un refus temporaire, sans écriture
partielle. Le registre idempotent est consulté **avant** la vérification de
l’aperçu : une réponse perdue reste rejouable même si le calendrier change ensuite.

#### Périmètre et validation

**Estimation indisponible** reste affiché : les montants techniques connus à
zéro ne deviennent jamais un budget gratuit. Les magasins, produits, prix,
comparaisons, coches de courses, possession interactive, modèles et historique
éditorial ne sont pas simulés. Les routes de possession/achat et de révision
existent déjà pour les prochaines étapes ; leur interface dédiée vient ensuite.
L’ancienne Épicerie de Calendrier et les accès d’Accueil restent provisoirement
en place jusqu’aux étapes 13–14, sans synchronisation implicite entre les deux.

La validation couvre les droits HTTP, le rejeu, les conflits, l’import partiel,
les identifiants indépendants, les ajouts conservés, les créations concurrentes,
la reprise mobile après erreur/redémarrage et les doubles appuis. Les avertissements
d’unités incompatibles sont recalculés à chaque révision, sans doublon après import.
L’édition mobile d’une quantité conserve sa dimension (masse, volume ou pièces),
sans conversion implicite entre dimensions ni écrasement d’un besoin composé.

Validation finale du 14 novembre 2026 : **726 tests backend réussis**, **14 essais
OCR réels ignorés car opt-in**, **185 tests mobiles réussis**, TypeScript,
**27 exports de contrats cohérents**, exports Expo **iOS, Android et web** et
construction stricte de la documentation réussis. Les exports ne constituent pas
des essais sur appareil ; l’accessibilité réelle iOS/Android reste à vérifier.
Le dépôt ne configure pas de commande lint mobile.

**Critère de passage satisfait :** lot A livré dans le dépôt ; prochaine étape :
**6 — Normaliser les formats et bases tarifaires vérifiables**.

### 2.8. Normalisation des ventes — étape 6

#### Migration Supabase appliquée avant cette étape

À la demande de Hamza, `0017_shopping_lists` a été appliquée à la base Supabase
configurée le **14 novembre 2026**, depuis `0016`, dans une transaction.
La révision a été confirmée sur une nouvelle connexion après commit, le schéma
comparé aux modèles, les huit tables contrôlées avec RLS active sans politiques
mobiles, et les deux déclencheurs d’immutabilité vérifiés. Les empreintes et
comptages des dix tables applicatives préexistantes sont conservés, ainsi que
le nombre de comptes Auth. Voir [MIGRATIONS.md](MIGRATIONS.md).
Les mentions « non appliquée » des étapes 3–5 décrivent leur état historique.

#### Normalisation livrée

Le module `backend/app/catalog/sales.py` fournit `normalize_sale`,
`normalize_catalog` et `normalize_database`. Il sépare le format candidat,
le contenu net attesté, la base du prix (`package`, `weight`, `count`,
`unknown`), le dénominateur tarifaire, le pas/minimum de vente, la qualité de
correspondance, la portée commerciale et les conditions. Le calcul des achats
et des montants de panier n’est pas réalisé dans cette étape.

Le parseur existant est réutilisé pour les formats simples et les poids
variables. Ses multiplications sont désormais exactes, même sous une faible
précision Decimal globale. Grammes, kilogrammes, litres, millilitres, livres et
pièces gardent leurs conversions certaines. Oz, plages et formats complexes
restent inconnus ; aucune densité ou équivalence de produit n’est inventée.

Une quantité source lisible ne certifie pas le contenu d’un paquet payé au prix
affiché. Les attestations facultatives `SaleReview` exigent identité du produit
et de l’ingrédient, empreinte de l’instantané commercial, date avec fuseau,
méthode et référence du contrôle. La correspondance, la variante, la portée,
le format, les conditions et la base tarifaire sont contrôlés séparément.
Une preuve manquante, périmée, ambiguë ou visant une autre identité bloque le
calcul ; les sources et preuves restent visibles. Membre, coupon et multiachat
ne deviennent pas des prix inconditionnels.

Les tarifs au poids conservent leur dénominateur exact, sans prix par gramme
arrondi. Un pas ou minimum inconnu bloque l’admissibilité. Les limites dont la
portée sur les ventes mesurées n’est pas attestée sont signalées. Les promotions
sont évaluées à la date des courses ; après expiration, seul le régulier connu
peut s’appliquer. Le prix après limite ne remplace jamais un régulier absent.
Un zéro explicite attesté reste distinct d’un prix manquant.

La commande `python -m backend.cli.normalize_sales` produit un rapport JSON,
sans modifier les sources ni les prix. Son mode base utilise une transaction
cohérente en lecture seule, une requête groupée, et le même adaptateur de produit
que Promos. Les deux documents `sale-reviews-1.0` et `sale-normalization-1.0`
ont leurs schémas exportés. Les réponses HTTP et identités de Promos ne changent
pas. Aucune migration supplémentaire ou dépendance n’est ajoutée.

Le [guide détaillé de normalisation](SALE_NORMALIZATION.md) décrit les champs,
contrôles, limites et commandes reproductibles. Le futur moteur devra filtrer
sur `eligible_for_calculation`, jamais sur la seule présence d’un prix ou d’un
`ingredient_id`.

#### Résultat et validation

Audit au **14 novembre 2026**, effectué sur le catalogue JSON et sur Supabase
en lecture seule : **93 références**, **90 formats candidats**, **3 inconnus**,
**0 référence admissible sans attestation**. Les ensembles de références et
leurs instantanés normalisés sont identiques entre ces deux sources.
Les correspondances actuelles restent proposées et les bases tarifaires
`source_unspecified` ne sont pas automatiquement certifiées. Ce résultat
préserve les références inconnues ; il ne les déclare ni gratuites ni absentes
du magasin. Les attestations positives des tests sont fictives et locales.

Validation : **61 nouveaux cas de test**, suite complète **787 tests backend
réussis, 14 OCR réels ignorés car opt-in**, **185 tests mobiles réussis**,
TypeScript et **29 exports de contrats cohérents**. La documentation est
construite en mode strict. Aucun changement d’interface dans cette étape ;
les essais sur appareil restent ceux à effectuer pour les étapes mobiles.

**Critère de passage satisfait :** données de vente normalisées et auditées,
inconnues explicites, provenance et parité conservées. Prochaine étape :
**7 — Couverture en paquets, prix au poids, combinaisons et paliers**.
L’interface reste à « Estimation indisponible » jusqu’au raccordement du moteur.

### 2.9. Calcul des achats — étape 7

**Étape réalisée le 16 novembre 2026.** Le module interne
`backend/app/shopping_lists/purchases.py` expose `calculate_coverage` pour
calculer les achats d'un besoin regroupé dans chaque magasin, sans écriture.
Les contrats HTTP, tables et écrans ne changent pas. Le
[guide du moteur](PURCHASE_CALCULATION.md) décrit ses entrées, sorties,
arrondis, preuve de réduction et limites.

#### Calcul livré

- Regroupement exact des contributions compatibles d'un ingrédient ; retrait
  des quantités déclarées disponibles ou déjà achetées, sans valeur négative.
  Besoins non quantifiés et dimensions incompatibles restent à vérifier.
- Revalidation des sources et attestations à la date des courses. Formats,
  correspondances, conditions ou tarifs inconnus restent exclus avec leurs
  motifs ; aucune référence réelle n'est promue automatiquement.
- Couverture par paquets entiers et combinaisons de formats attestés ; ventes
  au poids ou en pièces avec dénominateur, minimum et pas connus. Le poids
  réellement payé reste estimatif.
- Réutilisation de `purchase_total` pour les promotions actives et leurs
  paliers ; regroupement par produit avant application de la limite. Les
  quantités déjà affectées peuvent réserver les unités promotionnelles.
  Sans information d'usage après un achat partiel, le tarif limité est exclu.
- Calcul exact intermédiaire, arrondi HALF_UP par référence au centime, puis
  somme des lignes ; taxes et consignes inconnues non inventées.
- Recherche dans chaque magasin sans fractionner automatiquement un besoin
  entre magasins. Départage par coût, surplus, nombre de références puis
  identifiants stables. Les références exclues restent visibles en diagnostic.

#### Bornes et validation

La recherche énumère les combinaisons utiles, avec une référence utilisée comme
complément minimal couvrant. Les quantités supérieures au besoin couvert par
cette seule référence sont inutiles sous les tarifs non décroissants pris en
charge. Le cas à un seul format est résolu directement. Par défaut :
12 références admissibles, 10 000 options par référence énumérée et
100 000 combinaisons par magasin. Dépasser une borne retourne `search_limit`
sans approximation annoncée optimale ; aucun meilleur magasin global n'est
désigné si sa recherche reste incomplète. Ces limites bornent les opérations,
sans garantie de durée réelle sur tous les appareils.

Validation : **83 nouveaux tests**, dont **35 cas d'oracle exhaustif avec
paliers** et **15 cas d'oracle mêlant poids, minimums et arrondis**. Suite complète
sur PostgreSQL local : **870 tests backend réussis, 14 OCR réels ignorés car
opt-in**. Les **29 exports de contrats** sont cohérents. Un essai de
99 856 combinaisons prend environ une seconde sur la machine de développement,
sans constituer une garantie de performance. Aucune migration, modification
de Supabase ou dépendance ajoutée ; aucun fichier mobile modifié.

**Critère de passage satisfait :** couverture et coûts du moteur vérifiés dans
ses bornes. Prochaine étape : **8 — Comparaison sans mutation puis application
atomique**. Le nouveau détail mobile conserve « Estimation indisponible » tant
que ces calculs ne sont pas raccordés ; la normalisation disponible ne remplace
pas les attestations commerciales encore manquantes du catalogue réel.

## 3. Vocabulaire et cycle de vie

### 3.1. Liste, modèle et historique

| Objet | Définition |
| --- | --- |
| Liste | Instance concrète de besoins et d’achats appartenant à un compte. |
| Liste en cours | Liste en préparation ou utilisée pour les courses. Plusieurs sont possibles ; une seule peut être épinglée pour l’accès rapide de l’accueil. |
| Liste sauvegardée | Libellé utilisateur d’un modèle réutilisable. Il conserve des besoins, pas un achat déjà effectué. |
| Historique | Vue des listes terminées ou archivées ; pas une deuxième copie de chaque liste. |
| Besoin | Quantité d’un ingrédient ou article souhaité, avant sélection des produits. |
| Achat proposé | Produit, magasin, nombre de paquets ou poids à acheter pour couvrir un besoin. |
| Proposition | Simulation des achats pour un scénario de magasins ; sans effet avant application. |
| Révision | État enregistré d’une liste après une mutation atomique, avec numéro croissant. |

Statuts techniques proposés : `draft`, `active`, `completed`, `archived`.

- Un brouillon est déjà enregistré mais peut être incomplet ou sans produit.
- Une liste active peut contenir des prix inconnus : acheter reste possible.
- « Terminer les courses » demande une décision explicite si des besoins restent
  ouverts ; conserver leur état et ne pas les marquer achetés automatiquement.
- Une liste terminée est consultable sans être modifiée silencieusement.
  « Reprendre » ouvre une nouvelle révision active en conservant la révision de
  clôture ; « Réutiliser » crée une autre liste et remet les achats à zéro.
- Archiver retire la liste des accès en cours sans effacer son contenu.
- La suppression définitive exige une confirmation. Une suppression d’article
  facilement annulable ne doit pas multiplier les boîtes de confirmation.

### 3.2. États d’un besoin

Ne pas stocker seulement une coche sur l’identifiant d’ingrédient. Conserver
la quantité demandée, la quantité déclarée disponible et les achats couverts.
Les états affichés sont dérivés : **À acheter**, **Partiellement acheté**,
**Acheté**, **Déjà disponible**, **À vérifier**. Un prix inconnu est un état de
chiffrage, pas une preuve que l’article n’a pas été acheté.

Exemple : 200 g sont couverts par un achat ; le besoin passe à 800 g. Si
l’achat enregistré correspond à un paquet de 500 g, signaler 300 g restant
à couvrir. Si la couverture de l’achat est inconnue, demander une vérification
au lieu de supposer que la nouvelle quantité est couverte.

## 4. Navigation et écrans

### 4.1. Organisation

Conserver React Navigation et les cinq onglets existants. Ajouter une pile
typée pour Liste avec, selon les composants nécessaires : accueil des listes,
création depuis calendrier, détail, comparaison, modèles et historique.
Les paramètres et les parcours comptes restent accessibles depuis Accueil.

À terme, Calendrier propose « Créer une liste pour cette période » et l’accès
aux listes associées. Accueil ouvre la liste épinglée par son identifiant.
Ne pas conserver deux moteurs indépendants sous Calendrier et Liste.

### 4.2. Accueil de Liste

Reprendre la hiérarchie de la première capture :

1. Titre « Liste d’achats » et description courte, dans le ton actuel de
   l’application : « Crée, organise et retrouve tes listes d’épicerie. »
2. Action principale « Créer une liste ».
3. Section « En cours » si nécessaire : nom, période, progression et accès.
4. Section « Listes sauvegardées », cartes de modèles et « Voir tout ».
5. Section « Historique », éléments récents et « Voir tout » si nécessaire.

Les noms Anniversaire, Fête, Voyage, Été et Printemps sont des exemples visuels,
pas des données à injecter chez chaque utilisateur. Les illustrations doivent
rester secondaires ; utiliser les ressources existantes avant d’en ajouter.
Une grille de modèles passe à une colonne si l’espace ou la taille de texte
le nécessite. Afficher les dates réelles et éviter les noms tronqués ambigus.

Un visiteur voit une présentation sans données personnelles. Proposer la
connexion lorsqu’il veut créer ou retrouver ses listes ; annuler conserve
l’écran et n’enregistre aucune donnée dans un compte anonyme partagé.

### 4.3. Création depuis le calendrier

La feuille « Créer une liste » propose « Depuis mon calendrier » et « Manuellement ».

Pour le calendrier :

1. Préremplir les dates de la semaine consultée si l’entrée vient de Calendrier,
   sinon la semaine courante. Afficher les deux dates avant tout calcul.
2. Permettre leur modification ; bornes incluses, fin non antérieure au début.
3. Charger les semaines nécessaires puis retenir uniquement les repas dans
   l’intervalle. Ne pas limiter la période à une semaine par erreur technique.
4. Produire un aperçu : nombre de repas retenus, ingrédients, quantités,
   exclusions appliquées et éventuels repas inaccessibles.
5. Confirmer avec « Créer la liste » puis ouvrir le détail enregistré.

Nom automatique : « Épicerie 12–18 nov. 2026 », avec mois et années explicités
lorsqu’ils diffèrent. Le nom est modifiable sans changer la période.
Enregistrer la période des repas séparément de la date prévue des courses.
Cette dernière vaut aujourd’hui par défaut dans le fuseau `America/Toronto`
et peut être changée avant comparaison.

Les notes libres et les restes ne produisent pas d’ingrédients. Afficher un
résumé de cette règle. Un reste n’ajoute pas rétroactivement des portions au
repas d’origine ; ne pas prétendre vérifier que le stock de restes suffit.

Une période sans repas propose d’ouvrir Calendrier ou de créer manuellement.
Une panne ne devient pas une liste vide. Un repas dont la recette est absente
ou inaccessible est signalé et exige une confirmation explicite si l’utilisateur
souhaite créer la partie accessible. Conserver cette limite dans la liste.

### 4.4. Création manuelle et édition

Demander un nom non vide puis ouvrir le détail avec « Ajouter à ma liste… ».
La recherche couvre ingrédients, alias et produits du catalogue. Un produit
reconnu doit remonter à son ingrédient canonique lorsque le lien est fiable.
Permettre l’ajout libre sans correspondance et sans prix inventé.

Après sélection, proposer quantité et unité, ou « Quantité à préciser » pour
un article libre. Un nombre de paquets explicitement saisi est une quantité
de vente, distincte d’un poids requis. Ne pas choisir automatiquement la
première suggestion en validant un texte ambigu au clavier.

En présence d’un besoin compatible, proposer l’ajout de la quantité à la ligne
existante. Conserver la provenance manuelle dans les contributions. Les unités
incompatibles restent identifiées séparément sous le même ingrédient, avec un
avertissement ; ne pas remplacer une quantité existante sans le dire.

Les actions nom, quantité, unité, ajout, retrait et choix du produit sont
disponibles pour les listes manuelles comme pour celles issues du calendrier.
Une modification de la liste ne modifie ni recette ni repas source.

### 4.5. Détail et courses

Présenter dans cet ordre : nom, période éventuelle, date des courses, progression,
budget ou sous-total connu, avertissements et articles regroupés par magasin
puis par rayon. L’ajout d’article reste visible sans masquer les premières lignes.
Les actions secondaires sont regroupées dans un menu nommé « Options de la liste ».

Une ligne distingue le besoin de l’achat :

```text
Riz — besoin : 2 kg
4 × paquet 500 g · Maxi
12,00 $ estimés
Pour : recette A, mardi · recette B, jeudi
```

La case signifie « Acheté ». Toucher le reste de la ligne ouvre sa fiche.
Les achats cochés restent consultables et décochables dans une section repliable.
Leurs produits et estimations ne changent pas quand ils sortent de « Reste à acheter ».

Afficher « Comparer les magasins » pendant la préparation et « Terminer les
courses » pendant l’utilisation ; éviter deux boutons concurrents de même
importance. Une liste non chiffrable reste utilisable pour cocher les achats.

### 4.6. Comparaison sans mutation implicite

Les segments **Maxi · Metro · Super C · Moins cher** appartiennent à un écran
ou panneau clairement intitulé « Comparer ». Ce sont des simulations de la
même liste, pas quatre listes indépendantes ni un filtre modifiant les achats.

- Maxi, Metro et Super C simulent les besoins dans l’enseigne correspondante.
- Moins cher affecte chaque besoin à l’achat admissible le moins coûteux parmi
  les magasins autorisés, avec les contraintes et choix manuels conservés.
- Montrer le coût connu, les besoins non couverts et le nombre de magasins.
- Expliquer « Peut nécessiter plusieurs magasins ; déplacements non inclus ».
- « Appliquer cette proposition » est la seule action qui change les affectations.
- Permettre de revenir au choix automatique pour un article ou de réinitialiser
  explicitement les choix manuels avant une nouvelle comparaison.
- Une sélection manuelle incompatible avec le scénario apparaît comme telle :
  proposer de la conserver hors de ce magasin ou de la remplacer. Ne pas
  l’ignorer silencieusement pour faire baisser le montant.

Dans le détail des courses, des filtres par magasin montrent uniquement la
répartition appliquée. Changer ce filtre ne recalcule pas les choix.

### 4.7. Fiche d’article, possession et exclusions

La fiche présente les quantités, produits et formats connus, coûts d’achat,
magasins et conditions de promotion. Elle défile sur petit écran. Les actions :

| Action | Portée et conséquence |
| --- | --- |
| Modifier le besoin | Cette liste ; recalcul explicite des achats restants, avec signalement des compléments après achat |
| J’en ai déjà | Cette liste ; quantité totale ou partielle déclarée disponible ; action annulable |
| Le prendre ailleurs | Choix manuel stable de produit et magasin ; estimation recalculée et enregistrée |
| Revenir au choix automatique | Retire le choix manuel, affiche la proposition avant application si les achats changent |
| Ne plus suggérer | Préférence pour les générations futures ; expliquer et confirmer cette portée |
| Retirer de la liste | Cette liste uniquement ; proposer Annuler |

« Ne plus suggérer » ne modifie pas les listes existantes. Pour retirer aussi
l’article courant, fournir une action distincte. Les ingrédients exclus restent
recherchables et ajoutables manuellement. Paramètres permet de consulter et
retirer ces exclusions. Ne pas transformer automatiquement l’ancien garde-manger
local en exclusions nouvelles sans aperçu ni choix de l’utilisateur.

## 5. Agrégation et couverture des besoins

### 5.1. Calcul déterministe

Pour chaque contribution d’un repas :

```text
quantité requise = quantité de la recette × portions du repas / portions de la recette
besoin restant = max(0, besoin requis − quantité disponible déclarée − couverture achetée)
```

Utiliser `Decimal` pour les quantités et les montants. Conserver la précision
intermédiaire ; arrondir les montants selon la règle documentée au centime lors
du calcul de ligne puis sommer ces lignes. Ne pas calculer en flottants JavaScript.
Pour les rapports de portions, garder des fractions exactes jusqu’au regroupement.
Les quantités décimales finies sont exactes ; les fractions non finies sont
représentées par excès à six décimales, avec avertissement. Les besoins serveur
ne sont pas recalculés depuis les contributions déjà arrondies pour affichage.

Fusionner par ingrédient canonique et dimension compatible. Conserver les
contributions des repas et des ajouts pour expliquer la quantité et permettre
une future actualisation du calendrier sans perdre les modifications manuelles.
Un article libre ne se fusionne pas automatiquement avec un autre par nom seul.

Conversions certaines : `kg ↔ g`, `L ↔ ml`, tasse de 250 ml, cuillère à table
de 15 ml et cuillère à thé de 5 ml, conformément aux unités du projet. Ne pas
convertir `unit` en grammes, volume en masse ou morceau en paquet sans donnée
explicite. Le libellé « oz » doit être désambiguïsé avant toute conversion.

### 5.2. Produits admissibles

Un `ingredient_id` commun est nécessaire mais ne suffit pas à prouver la
substituabilité. Examiner variante, format, base tarifaire, enseigne,
succursale et provenance. Le catalogue actuel conserve des correspondances
proposées et des formats `source_unspecified` : ne pas annoncer une couverture
exacte pour tout le catalogue sur cette seule base.

Introduire si nécessaire une normalisation additive et testée des données de
vente : dimension, contenu net par paquet, base du prix (`package`, `weight`,
`count`, `unknown`), unité tarifaire, pas de vente connu et qualité du lien.
Réutiliser les parseurs de formats disponibles ; conserver la valeur brute
et la justification de la normalisation. Les références non vérifiables sont
visibles mais exclues du calcul présenté comme couvrant le besoin.

Une offre sans prix peut avoir un produit et un format connus. Ne pas la
masquer comme indisponible. « Produit non trouvé dans nos données » ne signifie
pas « Produit absent du magasin ». Aucune consultation ne déclenche une collecte.

### 5.3. Nombre de paquets et formats multiples

Pour un seul format fiable : `nombre_paquets = ceil(besoin / contenu_paquet)`.
Pour des formats interchangeables, comparer les combinaisons entières qui
couvrent le besoin. Un achat peut donc comporter plusieurs références et
plusieurs lignes de conditionnement sous un même besoin.

Ne pas utiliser un simple tri par prix du paquet ou une stratégie gloutonne
présentée comme optimale. Implémenter un algorithme déterministe borné sur des
quantités normalisées exactes, avec preuve par petits cas exhaustifs. Réduire
les états par les formats utiles et leurs paliers de prix ; documenter les
limites de taille et de durée. Si le calcul dépasse ces limites, retourner
une proposition à vérifier ou aucune proposition complète, sans affirmer
qu’une approximation est la moins chère.

Départager les coûts égaux par moins de surplus, moins de références, puis
identifiants stables. Pour Moins cher, comparer d’abord le coût d’achat complet
par magasin ; ne pas découper automatiquement un même besoin entre plusieurs
magasins pour multiplier les limites promotionnelles.

### 5.4. Promotions, dates et prix au poids

Évaluer les offres à la date prévue des courses, indépendamment des dates des
repas. Réutiliser les conventions de [CONTRACTS.md](CONTRACTS.md) et
`purchase_total`, en l’adaptant explicitement aux représentations utilisées.

Pour `n` unités de vente pendant une promotion confirmée :

```text
coût = min(n, limite) × prix_promo + max(0, n − limite) × prix_après_limite
```

Sans limite, le prix promotionnel s’applique aux unités admissibles. Après la
promotion, utiliser le prix régulier connu ; le prix après limite ne devient
pas un prix régulier. Sans prix applicable, conserver un prix inconnu.

La limite concerne le même produit et la même portée commerciale : agréger
ses achats dans la liste avant application du palier. Deux contributions ou
deux lignes manuelles ne donnent pas deux droits à la même promotion. Les
offres aux conditions membre ou coupon non prises en charge ne deviennent
pas des prix universels ; afficher leurs conditions ou les exclure du scénario.

Pour un prix au poids, multiplier la quantité dans l’unité tarifaire connue,
avec la mention du caractère estimatif du poids réel. Ne pas utiliser un
tarif au kilogramme comme prix d’un paquet. Si un pas de vente ou une quantité
minimale est nécessaire mais inconnu, signaler la limite du calcul.

### 5.5. Budget, sous-total et progression

Retourner au minimum les agrégats suivants, calculés une seule fois côté serveur :

| Agrégat | Définition |
| --- | --- |
| `item_count` | Nombre de besoins logiques non retirés ; pas nombre de paquets |
| `remaining_item_count` | Besoins non entièrement achetés ou déclarés disponibles, y compris sans prix |
| `purchased_item_count` | Besoins entièrement couverts par les achats, éventuellement complétés par la possession ; possession seule insuffisante |
| `owned_item_count` | Besoins entièrement couverts par la possession déclarée |
| `unpriced_item_count` | Besoins non entièrement possédés dont l’achat ne peut pas être entièrement chiffré |
| `uncovered_item_count` | Besoins non couverts par les achats effectués, la possession ou une proposition couvrant la quantité ; distinct du seul prix |
| `budget_known_amount` | Estimation connue des achats prévus, achetés et restants ; possession exclue |
| `remaining_known_amount` | Part connue restant à acheter |
| `store_totals` | Répartition des montants connus par enseigne et succursale lorsqu’elle est établie |

Afficher par exemple « 3 achetés · 2 déjà disponibles · 4 à acheter », plutôt
qu’un pourcentage dont le dénominateur mélange besoins et paquets. Si un besoin
est partiellement disponible et partiellement acheté, le décompter une seule
fois ; l’état affiché suit sa couverture complète et son détail explique les parts.

Le budget ne baisse pas uniquement parce qu’un achat est coché. Il ne représente
pas une dépense réellement payée : une coche confirme un achat, pas un prix de reçu.
Si des achats ne sont pas chiffrables, afficher « Sous-total connu » et leur nombre.
Les taxes et consignes non documentées ne sont pas inventées ; préciser ce que
l’estimation inclut. Ne pas présenter « Économisés » comme un gain réalisé :
une économie estimée exige un prix de référence comparable pour les mêmes achats.

### 5.6. Actualisation explicite et stabilité

Une lecture retourne les estimations enregistrées, leur date et les alertes
de fraîcheur ; elle ne réécrit pas l’historique en utilisant les prix courants.
Pour une liste active, une nouvelle comparaison peut charger les offres récentes
et présenter les changements. Les achats déjà effectués gardent leur instantané.

L’actualisation depuis Calendrier utilise les contributions sources pour
présenter ajouts, retraits et variations. Préserver ajouts manuels, suppressions
volontaires, possession et achats. Si une réconciliation est ambiguë, demander
une décision ciblée. Ne pas déduire automatiquement l’intention de l’utilisateur.

Un produit manuel absent ou devenu non chiffrable reste sélectionné avec une
alerte. Une alternative est proposée sans être appliquée automatiquement.

## 6. Modèle de données proposé

### 6.1. Entités et responsabilités

Les noms ci-dessous ne sont pas des tables déjà déployées. Conserver les
tables du catalogue et du calendrier ; ne pas créer un second référentiel
d’ingrédients ou un nouveau système de comptes.

| Entité proposée | Données principales |
| --- | --- |
| `shopping_list` | Identifiant UUID, propriétaire, nom, source `manual/calendar`, statut, période des repas nullable, date des courses, révision courante, dates serveur, copie d’origine éventuelle |
| `shopping_list_item` | Identifiant stable propre à la liste, ingrédient nullable, nom et catégorie figés, position, besoins normalisés ou quantité libre à préciser, retrait volontaire éventuel |
| `shopping_list_contribution` | Origine d’un besoin : repas/recette ou ajout manuel, quantité/unité initiales, portions, date, nom de recette et version consultée |
| `shopping_list_purchase` | Article, produit stable, enseigne/succursale, nombre de paquets ou quantité au poids, contenu couvert, choix automatique/manuel, estimation et état d’achat |
| `shopping_list_possession` | Article ou composante de quantité, quantité déclarée disponible, portée à cette liste |
| `shopping_list_revision` | Liste et numéro uniques, auteur, commande, date serveur, instantané JSON versionné de l’état, provenance et montants enregistrés |
| `shopping_list_comparison` | Simulation privée, révision source, date des courses, empreinte du catalogue, scénarios calculés et expiration ; jamais utilisée comme historique durable des achats |
| `shopping_list_template` | Propriétaire, nom, icône autorisée, version, dates ; contenu des besoins à copier, sans coches ni anciens prix imposés |
| `shopping_list_template_item` | Besoin et quantité du modèle, identité canonique ou texte libre ; pas de référence fragile à une offre courante |
| `shopping_list_exclusion` | Propriétaire et ingrédient uniques, date ; préférence appliquée aux futures générations |
| Préférence de liste épinglée | Référence privée à une liste en cours, pour Accueil ; une seule par compte, aucune liste étrangère autorisée |
| Commande idempotente | Compte, clé client unique, empreinte du corps et résultat ; stockage minimal pour éviter les doubles créations et permettre les reprises |

Préciser à l’étape de schéma quelles composantes de quantité utilisent des
lignes et lesquelles utilisent un JSON validé. Préférer des tables pour les
relations et contraintes, et du JSON versionné pour les instantanés ; éviter
un ensemble arbitraire de champs JSON sans contrats.

Pour les états courants, une mutation met à jour les tables normalisées et
ajoute une révision immuable dans la même transaction. Ne pas construire un
système générique d’event sourcing : la révision représente un état complet
relisible, sans devoir rejouer toute l’histoire pour ouvrir une liste.

### 6.2. Identités, instantanés et suppressions

- Réutiliser `product_id` comme identité commerciale stable ; `offer.id` identifie
  un relevé et ne doit pas être la seule clé d’un choix durable.
- Conserver dans chaque achat le nom, format, base tarifaire, prix, promotion,
  conditions, source, date de relevé, date d’évaluation et qualité de correspondance.
- Une liste terminée doit rester lisible après modification ou retrait d’une
  offre. Une clé étrangère facultative vers l’offre courante ne remplace pas
  l’instantané et ne provoque pas de cascade destructrice.
- Les références à un repas ou à une recette peuvent devenir nulles sans
  supprimer les contributions et quantités enregistrées de la liste privée.
- Une référence étrangère n’est pas une autorisation : vérifier les droits
  lors de la création et des nouvelles importations depuis le calendrier.
- La suppression d’un compte supprime ses listes privées, modèles, exclusions,
  commandes et révisions. Elle conserve les règles existantes pour les recettes
  publiques. Ne pas intégrer les reçus ou leurs images à ce nouveau stockage.
- Les instantanés des besoins de la liste ne remplacent pas le futur historique
  complet des plans et contenus de recettes ; ne pas annoncer ce dernier réalisé.

### 6.3. Contraintes et migrations

Utiliser des montants et quantités numériques finis, non négatifs ; quantités
requises positives sauf brouillon non renseigné. Les unités appartiennent à
un ensemble explicite, les paquets sont entiers strictement positifs et les
prix sont en CAD. Un zéro explicite validé est distinct d’un prix inconnu ;
ne pas importer automatiquement une gratuité depuis un champ ambigu.

Contraindre les périodes cohérentes, noms non vides, statuts connus,
révisions positives, propriétaires et relations entre articles et achats.
Une mutation ne peut pas rattacher un article d’une autre liste ou d’un autre
compte. Indexer propriétaire/statut/date, liste/position, liste/révision et
les identités stables recherchées.

Créer une migration après la tête Alembic réelle au moment de l’étape ; ne pas
réutiliser un numéro désormais occupé. Les tables privées gardent RLS activée,
sans ouvrir un accès métier direct depuis le mobile. Tester la migration,
les cascades, les contraintes et les règles de retour avant toute application
sur la base partagée. Aucun démarrage API n’applique de migration automatiquement.

## 7. Contrats API proposés

Les contrats précis du **Lot A** sont désormais définis dans
[SHOPPING_LISTS_CONTRACTS.md](SHOPPING_LISTS_CONTRACTS.md) et dans les schémas
exportés. Ils précisent les propositions générales ci-dessous. Les routes
restent à implémenter ; celles des lots B et C restent des propositions.

### 7.1. Conventions communes

Les routes restent sous `/api/v1`. Toutes les listes, modèles et exclusions
sont privées, avec identité déduite du jeton Supabase vérifié par FastAPI.
Le client ne choisit pas librement `owner_id`.

Réutiliser pagination, enveloppes et erreurs de [CONTRACTS.md](CONTRACTS.md).
Les quantités et montants décimaux sont des chaînes JSON, les dates de repas
et de courses sont des dates sans heure, les horodatages serveur sont en UTC.
Les erreurs de champ doivent permettre une correction précise du formulaire.

Les mutations de listes existantes portent un `expected_revision` ; les créations
commencent en révision 1 sans révision attendue. Toutes portent une clé `Idempotency-Key`
générée une fois par action, conservée pendant ses reprises. Dans la transaction,
vérifier le résultat d’une commande déjà reçue avant de rejeter une révision
devenue ancienne ; une répétition identique retourne son résultat sans doubler
l’effet. Une même clé avec un corps différent renvoie un conflit.

Une lecture ou comparaison n’a pas besoin d’une clé de mutation. L’application
d’une proposition vérifie la révision et l’identité de la simulation ; ne pas
accepter un total fabriqué par le mobile comme résultat calculé par le serveur.

### 7.2. Ressources minimales

| Méthode et chemin proposés | Rôle et garde-fous |
| --- | --- |
| `GET /shopping-lists` | Listes du compte filtrées par statut, paginées et triées par date serveur |
| `POST /shopping-lists` | Création manuelle d’un brouillon nommé ; idempotente par commande |
| `POST /shopping-lists/calendar-preview` | Aperçu depuis une période ; aucune liste créée, droits des recettes vérifiés |
| `POST /shopping-lists/from-calendar` | Création à partir d’un aperçu validé ; contenu revérifié pour détecter un changement |
| `GET /shopping-lists/{id}` | État enregistré, révision, besoins, achats, agrégats et avertissements |
| `PATCH /shopping-lists/{id}` | Nom, date des courses et autres métadonnées autorisées ; changement de date signale les estimations à réévaluer |
| `POST /shopping-lists/{id}/items` | Ajout ou fusion contrôlée d’un besoin ; retourne l’article concerné |
| `PATCH /shopping-lists/{id}/items/{item_id}` | Quantité/unité, nom et retrait logique ; possession via sa commande dédiée |
| `PUT /shopping-lists/{id}/items/{item_id}/manual-purchase` | Achat déclaratif et couverture, même sans produit ni prix ; contrat fixé pour le Lot A |
| `PUT /shopping-lists/{id}/items/{item_id}/possession` | Fixer ou annuler la possession de cet article ; contrat fixé pour le Lot A |
| `PUT /shopping-lists/{id}/purchases/{purchase_id}/state` | Fixer acheté/non acheté ; jamais inverser aveuglément une coche lors d’une reprise |
| `POST /shopping-lists/{id}/comparisons` | Produire les scénarios sur l’état courant, sans mutation des achats |
| `POST /shopping-lists/{id}/apply-comparison` | Appliquer un scénario vérifié ; conserver les achats déjà effectués |
| `PUT /shopping-lists/{id}/items/{item_id}/choice` | Enregistrer ou retirer un choix manuel de produit, quantité de vente et magasin |
| `POST /shopping-lists/{id}/calendar-refresh-preview` | Présenter les différences avec le calendrier, sans effacement des décisions |
| `POST /shopping-lists/{id}/apply-calendar-refresh` | Appliquer les différences acceptées avec contrôle de révision |
| `POST /shopping-lists/{id}/complete` | Clôture, avec confirmation explicite des besoins restant ouverts |
| `POST /shopping-lists/{id}/archive` | Archivage réversible |
| `POST /shopping-lists/{id}/reopen` | Nouvelle révision active, ancienne révision de clôture conservée |
| `POST /shopping-lists/{id}/duplicate` | Nouvelle instance ; pas de reprise des coches ou de la possession |
| `GET /shopping-lists/{id}/revisions/{revision}` | Consultation privée d’un état passé |
| `GET /shopping-list-templates` | Modèles privés paginés |
| `POST /shopping-list-templates` | Sauvegarder les besoins d’une liste comme nouveau modèle |
| `PATCH /shopping-list-templates/{id}` | Renommer ou modifier le modèle sans modifier les listes déjà créées |
| `DELETE /shopping-list-templates/{id}` | Suppression du modèle confirmé ; aucune cascade vers les copies |
| `POST /shopping-list-templates/{id}/instantiate` | Nouvelle liste indépendante, prix à réévaluer et états d’achat remis à zéro |
| `GET /shopping-list-exclusions` | Préférences du compte |
| `PUT /shopping-list-exclusions/{ingredient_id}` | Ajouter une exclusion idempotente |
| `DELETE /shopping-list-exclusions/{ingredient_id}` | Retirer une exclusion idempotente |

Le tableau décrit les capacités à couvrir, pas une obligation de développer
toutes les routes dans le premier lot. Les opérations proches peuvent être
regroupées si leurs contrats restent explicites. Documenter la forme finale
dans les exports OpenAPI et les types TypeScript à chaque livraison.
Les commandes utilisant un chemin court ci-dessus ont toutes le préfixe
`/api/v1`, omis dans le tableau pour sa lisibilité.

### 7.3. Erreurs et protection concurrente

| Situation | Comportement attendu |
| --- | --- |
| Session absente/expirée | 401 ; conserver le travail du compte, demander la connexion sans transférer ses données |
| Liste, modèle ou ressource imbriquée absent ou étranger | 404, sans révéler les données de l’autre compte |
| Champ invalide, fin antérieure au début, unité incompatible imposée | 422 avec champs concernés |
| Révision dépassée | 409 `LIST_REVISION_CONFLICT` ; conserver la saisie et proposer de relire les changements |
| Même clé de commande, autre corps | 409 `IDEMPOTENCY_KEY_REUSED` |
| Calendrier changé depuis l’aperçu | 409 `CALENDAR_PREVIEW_STALE` ; refaire l’aperçu, pas de création partiellement différente |
| Proposition devenue inapplicable | 409 `COMPARISON_STALE` ; nouvelle comparaison explicite |
| Base ou fournisseur de données nécessaire indisponible | 503 ; aucune liste vide factice et aucune sauvegarde annoncée réussie |

Les lectures pour un aperçu calendrier doivent observer un ensemble cohérent
de repas et de recettes. Utiliser transaction cohérente ou empreinte des données
relues ; ne pas accepter un aperçu partiellement obsolète à cause de requêtes
séparées. Une transaction de mutation enregistre état, révision et commande
idempotente ensemble.

### 7.4. Exemples de contrats et portée des lots

Ces corps illustrent la cible ; ils ne sont pas des commandes à exécuter
contre l’API actuelle. Ne pas copier un identifiant d’exemple en base.
Les exemples validés du Lot A sont dans
[shopping-list-examples.json](../contracts/v1/shopping-list-examples.json).
La comparaison illustrée ci-dessous appartient au Lot B et reste à définir.

Aperçu depuis le calendrier, sans création :

```json
{
  "start_date": "2026-11-16",
  "end_date": "2026-11-22",
  "purchase_date": "2026-11-15"
}
```

La réponse comporte une empreinte de l’aperçu, les contributions, les besoins,
les exclusions appliquées et les repas exclus avec leur raison. La création
transmet cette empreinte et l’acceptation explicite d’un éventuel résultat
partiel ; le serveur relit les données pertinentes avant de confirmer.

Une comparaison comporte `expected_revision`, le scénario demandé et la
politique de conservation des choix manuels. Elle retourne son identifiant,
la révision source, les scénarios, leurs montants et limites. L’application
reçoit uniquement les références vérifiables :

```json
{
  "expected_revision": 4,
  "comparison_id": "00000000-0000-4000-8000-000000000001",
  "scenario": "cheapest"
}
```

Le serveur vérifie compte, liste, révision, date et empreinte des données avant
application. Conserver les simulations en base avec une durée maximale initiale
de 15 minutes, configurable et testée ; un catalogue modifié invalide aussi la
simulation même avant ce délai. Les aperçus calendrier utilisent une empreinte
recalculable et ne nécessitent pas d’archiver toutes les lectures comme listes.

Chaque lecture de détail doit exposer au minimum : `id`, `name`, `source`,
`status`, `revision`, `period`, `purchase_date`, `items`, `purchases`, `totals`,
`warnings`, `updated_at`. Les champs exacts et sous-schémas sont fixés avec
les premiers tests de contrats, puis exportés et consommés ensemble par le
backend et le mobile. Un montant nul et un montant inconnu sont différents :

```json
{
  "currency": "CAD",
  "budget_known_amount": "28.40",
  "remaining_known_amount": "12.00",
  "unpriced_item_count": 2,
  "estimate_complete": false
}
```

`estimate_complete` signifie que les achats prévus sont chiffrables selon les
bases et conditions déclarées ; il ne garantit ni prix réel, ni stock, ni
taxes inconnues. Le transport mobile doit conserver le code d’erreur structuré
et la révision utile lors d’un 409, au lieu de ne restituer qu’un message générique.

## 8. Persistance mobile, interruptions et hors connexion

### 8.1. Socle à livrer dès le premier parcours

- Toute liste confirmée est persistée côté serveur ; une simple navigation
  arrière ne la supprime pas.
- Un brouillon de formulaire non envoyé peut être conservé localement, isolé
  par compte et par brouillon, avec état d’enregistrement visible.
- Afficher « Enregistrement… », « Enregistré » ou « Modification non enregistrée ».
  Une lecture réussie ne masque pas une écriture échouée.
- Une action en attente bloque ses doubles appuis ou les regroupe avec une
  intention explicite ; elle conserve sa clé de reprise.
- Cache, résultats asynchrones, fenêtres ouvertes et reprises appartiennent au
  compte d’origine. Changement de compte : masquer immédiatement l’ancien contenu.
- Ne pas annoncer que ce premier socle rend déjà toutes les actions utilisables
  hors connexion.

### 8.2. Mode courses hors connexion

Livrer ensuite un cache de la dernière liste complète, avec révision et date
de synchronisation, et une file persistante minimale pour acheter/décocher.
Le bandeau indique « Hors connexion · dernières données enregistrées » et
le nombre d’actions en attente. Une coche locale n’est pas annoncée synchronisée.

Chaque commande fixe un état cible sur un achat identifié et conserve sa
clé idempotente. Au retour du réseau, ne pas rejouer un toggle ou écraser une
révision distante. Si la même cible existe sans changement incompatible,
réconcilier explicitement ; sinon afficher le conflit et conserver l’intention
locale jusqu’à résolution. Une réponse perdue après commit ne doit pas créer
un deuxième achat ni faire perdre une coche.

La création serveur, l’import calendrier et la nouvelle comparaison nécessitent
le réseau dans cette version ; l’interface conserve les brouillons et explique
la limitation. Ne pas annoncer un mode hors connexion complet. Les données
personnelles locales sont purgées lors d’une suppression de compte confirmée ;
un simple sign-out les masque sans les attribuer au prochain utilisateur.

## 9. Modèles et historique

Enregistrer un modèle copie les besoins et éventuellement des préférences
explicites de produit, pas les statuts acheté/disponible ou des prix imposés.
L’utilisateur peut choisir une icône dans un petit ensemble connu. Modifier
le modèle n’affecte aucune instance existante.

Réutiliser l’historique copie les besoins de la révision choisie. Les anciennes
informations de prix restent dans l’original ; la copie calcule ses propres
propositions pour sa date des courses. Un produit favori absent est signalé,
pas remplacé silencieusement. Les exclusions futures ne retirent pas à l’insu
de l’utilisateur des articles d’un modèle explicitement choisi : afficher un
aperçu si leur application est proposée.

L’historique montre nom, période éventuelle, date de clôture/archivage, nombre
d’articles et statut. Ne pas afficher les listes actives à la fois en cours et
historique. La suppression d’un modèle ne détruit ni liste ni révision.

## 10. Standards UI/UX et accessibilité

Conserver palette, composants, typographie et vocabulaire d’OptiMeal. Utiliser
le tutoiement présent dans les autres parcours et le format monétaire CAD avec
virgule française. Les dates complètes incluent l’année quand elle lève une ambiguïté.

| Sujet | Exigence vérifiable |
| --- | --- |
| Zones tactiles | Au moins 48 × 48 unités logiques pour les actions principales et icônes ; séparer les cibles voisines |
| Cases et fiches | Case indépendante de l’ouverture de la fiche, boutons non imbriqués, libellé et état annoncés |
| Contrastes | Viser WCAG AA : 4,5:1 pour le texte courant et 3:1 pour le grand texte et les éléments graphiques nécessaires |
| Couleurs | Aucun statut transmis seulement en vert/rouge ; texte et état accessibles |
| Texte agrandi | Titres, cartes, montants et boutons restent lisibles sans chevauchement ; grille adaptable et défilement |
| Comparaison | Quatre segments lisibles ; disposition adaptée ou défilement explicite si nécessaire, choix courant annoncé |
| Lecteurs d’écran | Ordre de lecture cohérent, libellés achat/produit/magasin, annonces de sauvegarde et erreurs sans répétition excessive |
| Panneaux | Hauteur limitée, contenu défilant, fermeture visible, retour Android et geste natif compatibles |
| Retour et clavier | Saisie conservée, clavier ne masquant pas l’action, aucune validation d’une suggestion non choisie |
| Destruction | Retrait courant annulable ; confirmation explicite pour suppression définitive |
| Débutant | Formulation claire du besoin, du paquet acheté, de la possession et du montant restant |

Chaque écran prévoit chargement, vide, erreur, données anciennes et reprise.
Ne pas montrer un succès « Tout est acheté » si des besoins ouverts sont cachés
par un filtre de magasin, un prix inconnu ou un import partiel. Les panneaux de
choix de produit restent utilisables avec beaucoup d’offres et un grand texte.

Références de conception à vérifier à nouveau lors des essais visuels :
[Apple — UI Design Dos and Don’ts](https://developer.apple.com/design/tips/),
[Apple — Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons),
[Android — Touch target size](https://support.google.com/accessibility/android/answer/7101858?hl=en),
[WCAG — Contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
Les captures fournies guident la composition ; elles ne démontrent pas une
validation de l’application sur appareil ni une modification de Figma.

## 11. Ordre de réalisation et critères de passage

Réaliser les étapes dans cet ordre. Avant une modification importante, présenter
le comportement changé, les fichiers touchés et les risques concrets. Une étape
reste ouverte tant que ses critères nécessaires ne sont pas vérifiés.

| Étape | Travail | Critère pour poursuivre |
| --- | --- | --- |
| 1 — Réalisée le 14 novembre 2026 | Relire ce guide, le code des listes, les consommateurs et la tête Alembic ; consigner les écarts nouveaux | Critère satisfait ; résultats dans la section 2.3, aucune migration créée |
| 2 — Réalisée le 14 novembre 2026 | Fixer schémas de besoins, contributions, achats, révisions et commandes ; écrire les contrats du premier lot | Critère satisfait ; schémas, exemples et types cohérents, décisions dans la section 2.4 |
| 3 — Réalisée le 14 novembre 2026 | Créer modèles et migration, services CRUD privés, idempotence et conflits | Critère satisfait ; persistance et services manuels testés, résultats dans la section 2.5 ; Supabase inchangé |
| 4 — Réalisée le 14 novembre 2026 | Développer agrégation de période et conversions certaines | Critère satisfait ; calculs, accès et instantanés testés, résultats dans la section 2.6 ; sauvegarde et routes à raccorder à l’étape 5 |
| 5 — Réalisée le 14 novembre 2026 | Développer accueil Liste, création manuelle et import calendrier avec aperçu | Critère satisfait ; routes privées, brouillons, édition et reprise idempotente vérifiés ; voir section 2.7 |
| 6 — Réalisée le 14 novembre 2026 | Normaliser les formats et bases tarifaires vérifiables | Critère satisfait ; formats, bases, contraintes et attestations normalisés ; inconnues classées, sources conservées et parité JSON/Supabase vérifiée ; voir section 2.8 |
| 7 — Réalisée le 16 novembre 2026 | Implémenter couverture en paquets, prix au poids, combinaisons et paliers | Critère satisfait ; calculs et oracles exhaustifs réussis, bornes documentées ; voir section 2.9 |
| 8 | Ajouter comparaison sans mutation puis application atomique | Changer de segment ne modifie rien ; choix manuels respectés ; total et couverture vérifiés |
| 9 | Adapter détail, fiche d’article, possession et achats partiels | Coche stable, compléments après augmentation visibles, cohérence de tous les badges |
| 10 | Ajouter exclusions, modèles, copie et historique par révision | Copie indépendante, zéro achat repris, original lisible après changements de prix/recette |
| 11 | Ajouter cache complet et reprise des coches hors connexion | Réponse perdue, redémarrage, conflits et changement de compte couverts |
| 12 | Proposer récupération des anciennes données locales privées | Import volontaire et idempotent, aucune attribution des anciennes clés communes |
| 13 | Raccorder Accueil et Calendrier aux listes identifiées | Même liste, même période et mêmes montants depuis tous les accès |
| 14 | Retirer l’ancien calcul local après bascule vérifiée | Aucun consommateur actif restant, aucun effacement des données avant reprise validée |
| 15 | Vérifier appareils, accessibilité, documentation et contrats exportés | Résultats iOS/Android consignés, limites indiquées, guide actualisé |

Regrouper ces étapes en trois livraisons utilisables :

- **Lot A — Listes persistantes et besoins fiables :** étapes 1 à 5. Création,
  période, besoins, édition et sauvegarde ; aucun total trompeur si le moteur
  de paquets n’est pas encore livré. Conserver provisoirement l’ancienne Épicerie.
- **Lot B — Achats et comparaison :** étapes 6 à 9. Quantités couvertes, prix,
  propositions, choix manuels et courses stables, sans promesse hors connexion.
- **Lot C — Réutilisation, résilience et bascule :** étapes 10 à 15. Modèles,
  historique, cache, reprise, migration locale et accès unifiés.

Les lots sont un ordre de livraison, pas une réduction du périmètre final.

## 12. Fichiers concernés lors de l’implémentation

| Emplacement existant | Travail attendu |
| --- | --- |
| `backend/app/shopping_lists/models.py` | Tables et relations privées |
| `backend/app/shopping_lists/schemas.py` | Contrats Pydantic explicites, quantités et erreurs |
| `backend/app/shopping_lists/service.py` | Mutations transactionnelles et génération ; extraire calculs et comparaisons en modules du domaine si nécessaire |
| `backend/app/shopping_lists/router.py` | Routes courtes, identité et délégation au service |
| `backend/app/main.py` | Enregistrer les nouvelles routes au moment où elles fonctionnent |
| `backend/app/common/units.py`, `prices.py` | Conversions et règles communes déterministes si leur partage est utile |
| `backend/app/catalog/pricing.py`, `formats.py` | Réutiliser et adapter les calculs et interprétations fiables |
| `backend/app/catalog/common_schemas.py` | Éventuels champs additifs sur les données de vente, sans casser Promos |
| `backend/app/planning/`, `recipes/` | Lectures et droits existants pour génération ; éviter de recopier les règles d’accès |
| `backend/alembic/versions/`, métadonnées Alembic | Migration unique après la tête réelle et découverte des nouveaux modèles |
| `backend/tests/` | Tests de domaine, routes, PostgreSQL et migrations des listes |
| `backend/cli/export_shared_contracts.py`, `backend/contracts/v1/` | Exporter les nouveaux schémas et exemples au fil des contrats livrés |
| `mobile/App.tsx`, `mobile/types/navigation.ts` | Pile Liste et accès par identifiant/période |
| `mobile/app/ListScreen.tsx` | Accueil des listes puis écrans dédiés de création, détail et comparaison selon besoin |
| `mobile/components/ShoppingListView.tsx`, `ArticleSheet.tsx`, `AddItemField.tsx` | Adapter présentation et actions, sans conserver un moteur de prix concurrent |
| `mobile/components/useShoppingList.ts`, `shoppingList.ts` | Transition vers API/cache ; conserver temporairement l’ancien parcours jusqu’à bascule |
| `mobile/services/api.ts`, `accountStorage.ts` | Transport et erreurs structurées, cache et commandes isolées par compte |
| `mobile/types/api.ts` | Types des listes, besoins, achats, agrégats, propositions et révisions |
| `mobile/app/HomeScreen.tsx`, `CalendarScreen.tsx`, `ProfileScreen.tsx` | Liste épinglée, période explicite et gestion des exclusions |
| `mobile/tests/` | Parcours, réponses tardives, reprises et isolation des comptes |

Ne pas créer tous les fichiers proposés par anticipation. Choisir des modules
lisibles à mesure que les responsabilités existent. Aucune nouvelle bibliothèque
de navigation ou de calcul n’est requise par cette conception ; justifier une
dépendance seulement si un besoin concret la rend utile.

## 13. Plan de validation

### 13.1. Calculs et données de référence

| Cas | Résultat attendu |
| --- | --- |
| 200 g + 300 g du même ingrédient | Un besoin de 500 g, contributions conservées |
| 250 ml + 1 tasse | 500 ml, sans conversion masse/volume |
| 100 g + 1 tasse sans densité | Composantes incompatibles signalées, aucune quantité globale inventée |
| Recette pour 2, 100 g, repas pour 4 | 200 g requis |
| Plusieurs repas sur deux semaines, période partielle | Seulement les dates incluses ; bornes testées |
| Besoin 500 g, paquet 1 kg à 3,79 $ | Un paquet, 3,79 $, surplus expliqué |
| Besoin 2 kg, paquet 500 g à 3 $ | Quatre paquets, 12 $ |
| Besoin 1 kg ; 600 g à 4 $ et 400 g à 3 $ | Combinaison 600 + 400 à 7 $, plutôt que deux 600 g à 8 $ |
| 5 unités, 7,77 $ limité à 4 puis 10 $ | 41,08 $ pendant la promotion |
| Deux contributions au même produit limité | Limite partagée dans la liste, pas appliquée deux fois |
| Promotion expirée, régulier inconnu | Prix inconnu ; aucun recyclage du prix après limite |
| Produit au kg pour besoin en g | Tarif appliqué au poids converti, pas prix d’un paquet |
| Prix nul explicitement validé | Zéro connu distingué d’un prix manquant |
| Format ou correspondance incertaine | Besoin visible et chiffrage à vérifier |
| Égalité de propositions | Départage stable, pas de changement aléatoire au rechargement |
| Trop de combinaisons | Limite explicite et aucun résultat approximatif annoncé optimal |

### 13.2. Parcours, sécurité et résilience

Vérifier au minimum :

- Période sans repas, notes et restes, recette absente, recette inaccessible,
  panne pendant l’aperçu et changement entre aperçu et création.
- Quantité manuelle fusionnée avec un besoin importé, unité incompatible,
  suppression volontaire et conservation lors d’une actualisation calendrier.
- Même liste ouverte depuis Accueil, Calendrier et Liste, avec les mêmes
  compteurs et montants, sans recours à la semaine courante implicite.
- Changement de scénario sans écriture ; application confirmée ; choix manuel
  conservé ; retour explicite automatique ; changement de filtre sans recalcul.
- Achat coché sans variation des magasins ; budget stable et reste décroissant ;
  augmentation du besoin après achat et possession partielle.
- Besoins sans prix et non couverts encore visibles ; aucun faux « Tout est acheté ».
- Modèle réutilisé sans coche ni possession ; original inchangé ; historique
  lisible après mise à jour d’une recette, d’un prix ou retrait d’une offre.
- Ressources de A inaccessibles à B, y compris article, achat, proposition,
  révision, modèle et exclusion ; suppression du compte avec nettoyage privé.
- Même commande rejouée après réponse perdue, corps différent avec même clé,
  double appui, conflit de révision et édition depuis deux appareils.
- Erreur d’enregistrement distincte de la lecture ; reprise après redémarrage ;
  actions hors connexion rattachées au bon compte ; session expirée ou changée.
- Migration locale volontaire sans double import ; anciennes clés sans
  propriétaire ignorées ; aucun ancien montant présenté comme nouveau calcul.

### 13.3. Vérifications de livraison

Exécuter les tests pertinents à chaque étape. Une fois les contrôles ciblés
réussis, lancer les vérifications adaptées à la livraison :

```bash
# Racine, avec l’environnement Python activé
python -m pytest backend/tests -q
python -m backend.cli.export_shared_contracts --check
python -m zensical build --strict

# Depuis mobile/
npm run typecheck
npm test
npm exec -- expo export --platform ios --platform android --output-dir /tmp/optimeal-lists-export
```

Les tests PostgreSQL utilisent une base locale jetable explicitement configurée
avec `OPTIMEAL_TEST_DATABASE_URL`, jamais la base Supabase partagée. Ne pas
considérer les tests ignorés comme validations réussies. Vérifier la migration
et la conformité Alembic sur cette base. Aucun lint mobile n’est configuré au
moment de la rédaction ; ne pas annoncer un lint réussi ni installer un nouvel
outil implicitement pour remplir cette ligne.

Les tests normaux utilisent des catalogues et réponses maîtrisés. Aucun appel
payant, aucune collecte marchande réelle ou OCR réel n’est nécessaire pour
valider le moteur des listes.

### 13.4. Scénario manuel sur appareil

1. Ouvrir Liste en visiteur, demander la création puis annuler la connexion.
2. Se connecter sous A, choisir une autre semaine dans Calendrier et créer sa
   liste ; vérifier dates, portions et aperçu.
3. Ajouter un ingrédient déjà présent et un article libre ; modifier quantité
   et unité ; vérifier le total ou le sous-total approprié.
4. Comparer les quatre scénarios ; vérifier qu’aucune affectation ne change avant
   application. Appliquer puis choisir volontairement un produit ailleurs.
5. Cocher, décocher, déclarer une quantité déjà disponible et augmenter un besoin.
   Vérifier progression, budget, compléments et absence de changement de magasin.
6. Fermer puis rouvrir ; vérifier sauvegarde et choix manuels. Tester ensuite
   le mode hors connexion livré, ses indications et sa reprise après réseau.
7. Créer une exclusion, générer une autre liste, vérifier sa portée et la retirer
   depuis Paramètres ; vérifier que l’ajout manuel reste possible.
8. Sauvegarder un modèle, terminer avec un besoin encore ouvert après confirmation,
   consulter l’historique et réutiliser ; vérifier indépendance et remises à zéro.
9. Passer sous B puis en visiteur ; ne retrouver aucune donnée de A. Revenir sous A.
10. Refaire les parcours avec texte agrandi, lecteur d’écran, clavier ouvert et
    petit écran. Vérifier retour iOS/Android et panneaux longs.

Consigner séparément plateforme, version testée, scénarios réussis et limites.
Une confirmation globale sur téléphone ne vaut pas validation de tous les
scénarios iOS et Android. Un export réussi ne remplace pas un essai sur appareil.

## 14. Définition de terminé et suivi du document

Le nouvel onglet est terminé lorsque les parcours demandés fonctionnent,
les données privées sont persistantes et isolées, les calculs et inconnues
sont explicables, les choix restent stables, les erreurs permettent une reprise,
les tests nécessaires passent et les essais manuels sont consignés.

Au début de chaque lot, vérifier l’état réel du dépôt et mettre à jour les
écarts avec cette référence. À la fin, indiquer les étapes livrées, fichiers
concernés, migration éventuelle, vérifications exécutées et limitations. Ne pas
réduire les critères silencieusement pour considérer un lot terminé.

Suivi de réalisation ; la fin de l’audit ne signifie pas que les fonctionnalités
cibles sont implémentées :

- [x] Étape 1 : audit du dépôt, consommateurs et réutilisation, écarts et chaîne Alembic vérifiés ; voir section 2.3.
- [x] Étape 2 : schémas et contrats du premier lot fixés, avec résolution des points issus de l’audit ; voir section 2.4.
- [x] Étape 3 : migration et services privés manuels, transactions et tests PostgreSQL ; voir section 2.5. Routes non raccordées.
- [x] Étape 4 : agrégation et aperçu de période, conversions certaines et validation de l’empreinte ; voir section 2.6. Aucun enregistrement depuis calendrier à ce stade.
- [x] Étape 5 : API privée et parcours mobile de création/édition avec reprise ; voir section 2.7.
- [x] Étape 6 : formats et bases tarifaires normalisés, migration 0017 appliquée sur Supabase ; voir section 2.8.
- [x] Étape 7 : moteur de couverture et prix, paliers et oracles exhaustifs ; voir section 2.9.
- [x] Lot A : persistance, période et création fiables ; essais sur appareils à compléter.
- [ ] Lot B : achats, comparaison et courses stables.
- [ ] Lot C : modèles, historique, résilience et bascule des accès.
- [ ] Vérifications complètes des contrats et migrations applicables.
- [ ] Essais iOS et Android consignés séparément.
- [ ] README et guides alignés sur les fonctionnalités effectivement livrées.

Les limites du catalogue doivent rester visibles après livraison : ce moteur
ne garantit ni le stock réel ni l’exactitude future d’un prix marchand. Cette
limite ne justifie pas un calcul de quantité incorrect ou une donnée inventée.
Le calcul d’un trajet, la limitation avancée du nombre de magasins, les
recommandations IA et la confirmation par reçu gardent leurs propres travaux ;
ce guide prépare leur intégration sans les annoncer présents.

## 15. Documents associés

- [Fonctionnement actuel de l’application](../../README-fonctionnement.md).
- [Guide mobile](../../mobile/README.md).
- [Calendrier et repas](PLANNING.md).
- [Contrats HTTP existants](CONTRACTS.md).
- [Contrats préparatoires des listes — Lot A](SHOPPING_LISTS_CONTRACTS.md).
- [Calcul des achats — moteur de l'étape 7](PURCHASE_CALCULATION.md).
- [Migrations applicatives](MIGRATIONS.md).
- [Modèle de catalogue et de prix proposé](DATABASE.md).
- [Données locales et provenance](DATA.md).
- [Authentification et suppression du compte](AUTH.md).

Les notes locales `tools/` peuvent rappeler cette référence, mais ne doivent
pas être sa seule porte d’entrée : elles sont ignorées par Git. Les deux
captures et le texte joints à la conversation ont servi à cette conception ;
ne pas dépendre de leur chemin temporaire pour implémenter les règles écrites ici.

*Dernière mise à jour : 16 novembre 2026.*

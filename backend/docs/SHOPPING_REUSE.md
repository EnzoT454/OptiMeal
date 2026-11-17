# Modèles, exclusions, copie et historique — étape 10

L’onglet Liste sépare les listes **En cours** (brouillons et actives) de
l’**Historique** (terminées ou archivées). Les options d’une liste permettent de
copier ses besoins, de l’enregistrer comme modèle et de retrouver ses besoins.
Les ingrédients non suggérés sont gérés depuis leur fiche et depuis Paramètres.

## Migration et stockage

La migration **0020_shopping_reuse** suit 0019 ; la tête actuelle est 0021. Elle ajoute :

- `shopping_list_template` : nom, icône autorisée, révision et besoins privés ;
- `shopping_list_exclusion` : préférence unique par compte et ingrédient ;
- `shopping_resource_command` : résultat idempotent des commandes de modèles et
  d’exclusions, indépendant du résultat des commandes de listes ;
- `shopping_list.origin`, nullable : identité et révision de la liste ou du
  modèle copié. L’origine ne crée aucune dépendance vers le contenu vivant.

Les trois nouvelles tables utilisent RLS sans politique d’accès mobile direct.
Les clés étrangères vers le profil assurent le nettoyage après suppression du
compte. Les besoins d’un modèle sont un instantané JSON validé et borné à 500
articles ; ils ne nécessitent ni consultation indépendante ni calcul de prix
avant l’instanciation. Le modèle ne contient aucune couverture ou estimation.
Le retour à 0019 refuse d’effacer modèles, exclusions, commandes ou origines
existants. Les anciennes révisions restent lisibles avec une origine nulle.

**0020 a été constatée déjà présente sur Supabase lors du contrôle du
16 novembre 2026 précédant l’application de 0021. La cible est maintenant
vérifiée à 0021.** Le suivi initial de l’étape 10 n’établissait pas encore son
déploiement. Pour une autre base à mettre à niveau :

```bash
python -m alembic -c backend/alembic.ini upgrade head
```

## Copier la liste courante

1. Ouvrir les options de la liste courante, y compris une liste terminée dans l’historique.
2. Choisir **Copier les besoins**, vérifier l’aperçu, le nom et une nouvelle date
   de courses. Les articles retirés sont ignorés.
3. Confirmer explicitement la reprise des choix manuels de produits si souhaité.
   Les choix automatiques d’une ancienne comparaison ne sont pas des préférences.
4. Créer un nouveau brouillon avec de nouveaux UUID pour la liste, les articles
   et les contributions. Les besoins corrigés et la provenance de la révision
   consultée sont conservés, même si les recettes ont changé depuis.

La copie ne reprend **aucun achat, possession, prix, comparaison ou état acheté**.
Ses propositions se calculent pour sa propre date des courses. Une copie d’une
liste calendrier garde sa période d’origine à titre de provenance, sans relire
les repas ni les recettes vivantes. Les articles libres restent distincts.
Si un ingrédient historique a disparu du référentiel, son nom et son besoin
restent présents comme article libre avec avertissement. Un choix de produit
repris doit être vérifié par une nouvelle comparaison ; un produit absent reste
signalé et n’est pas remplacé silencieusement.

## Modèles privés

**Utiliser comme modèle** depuis le menu **…** copie les besoins de la liste courante, avec un nom et
une icône parmi panier, chariot, feuille, repas et maison. Reprendre les choix
manuels est facultatif et explicite. Les achats et la provenance détaillée des
recettes ne sont pas nécessaires au contenu du modèle : ses instances créent
leurs propres contributions manuelles.

Un modèle est une liste enregistrée pour une occasion : fête, barbecue, voyage
ou sortie. Il se retrouve dans **Mes modèles**, à la fin de l’onglet Liste,
avec son icône et son nom. Son détail affiche le nom et les produits enregistrés.

Le menu **…** en haut à droite propose **Modifier le nom**, **Supprimer le modèle**
et **Ajouter un produit**. Le renommage ne transmet que le nom et la révision ;
il ne remplace pas les produits. Un ajout libre ou choisi dans le catalogue est
enregistré directement dans le modèle. Toucher un produit permet de le modifier
ou de le retirer après confirmation. Les autres dimensions de quantité et les
préférences existantes sont conservées ; retirer toutes les quantités est explicite.
Les nouveaux ingrédients doivent exister dans le référentiel ; une ancienne
identité disparue reste conservée jusqu’à une décision explicite.

Le détail mobile ne demande plus de nom de nouvelle liste ni de date prévue et
ne propose plus « Créer une liste depuis ce modèle » ou d’actions globales en bas.
Le contrat HTTP d’instanciation reste disponible côté serveur : il exige le nom,
la date et la révision du modèle, mais ce formulaire n’est plus exposé ici.
Une modification ultérieure du modèle ne change aucune instance déjà créée.
La suppression est logique : le modèle disparaît des lectures, et son résultat
de suppression reste rejouable après réponse perdue. Les listes et révisions
existantes restent intactes. Modèles et commandes sont supprimés avec le compte.

## Exclusions des prochaines générations

**Ne plus suggérer** exige une confirmation indiquant sa portée : les futures
listes issues du calendrier de ce compte. L’action ne retire rien de la liste
ouverte, des modèles ou de leurs copies ; **Retirer de la liste** reste distinct.
Paramètres → **Ingrédients non suggérés** permet de consulter et d’annuler les
préférences. Aucun ancien garde-manger local n’est importé automatiquement.

L’aperçu calendrier lit les exclusions dans la même transaction cohérente que
les repas et ingrédients. Il affiche les exclusions réellement appliquées.
Leur état participe à son empreinte : changer une préférence entre aperçu et
création exige un nouvel aperçu. Si tous les ingrédients sont exclus,
`accept_empty=true` confirme explicitement une liste vide. Aucun repas exploitable
reste une erreur distincte, même en présence d’exclusions.

Les ingrédients exclus restent recherchables dans le catalogue et ajoutables
manuellement. Le sélecteur d’ingrédients de l’ajout à Liste ne les masque pas.
Une fusion avec un besoin canonique existant demande de choisir entre addition
et article distinct. Les modèles choisis explicitement ne sont pas filtrés
silencieusement par les exclusions.

## Historique des listes

L’historique affiche nom, période éventuelle, statut, nombre d’articles et date
de clôture ou d’archivage. Les collections sont filtrées côté serveur avant
pagination ; une liste active n’apparaît pas dans l’historique. La réouverture
la replace dans En cours sans effacer ses anciennes révisions.

La consultation des anciennes versions d’une liste est retirée. Les copies et
modèles lisent l’état courant et refusent un compteur de concurrence périmé.
Aucune ancienne version n’est restaurée. Voir [le parcours actuel](SHOPPING_CREATION.md).

## Surface HTTP

Routes privées sous `/api/v1`, enveloppes communes `Detail` et `Page`. Les
mutations exigent `Idempotency-Key`. Tous les décimaux restent des chaînes JSON.

| Route | Corps et résultat |
| --- | --- |
| `GET /shopping-lists?collection=current\|history` | Pagination ; `collection` et `status` sont exclusifs ; sans collection, ancien comportement conservé |
| `POST /shopping-lists/{id}/duplicate` | `source_revision`, `name`, `purchase_date`, `include_choices=false` ; nouvelle liste, 201 |
| `GET /shopping-list-templates` | Modèles privés paginés |
| `POST /shopping-list-templates` | `source_list_id`, `source_revision`, `name`, `icon`, `include_choices=false` ; 201 |
| `GET /shopping-list-templates/{id}` | Modèle courant |
| `PATCH /shopping-list-templates/{id}` | `expected_revision`, nom/icône/articles modifiés ; modèle complet |
| `DELETE /shopping-list-templates/{id}` | Corps `expected_revision` ; modèle marqué supprimé, 200, reprise possible |
| `POST /shopping-list-templates/{id}/instantiate` | `expected_template_revision`, nom, date, choix facultatifs ; nouvelle liste, 201 |
| `GET /shopping-list-exclusions` | Préférences privées paginées |
| `PUT /shopping-list-exclusions/{ingredient_id}` | État cible `excluded: true/false` |
| `DELETE /shopping-list-exclusions/{ingredient_id}` | Même état cible que `excluded=false`, sans corps |

Un modèle ancien reçoit 409 `TEMPLATE_REVISION_CONFLICT`. Les ressources
étrangères restent 404. Une liste vide après exclusions sans confirmation
reçoit 422 `EMPTY_LIST_CONFIRMATION_REQUIRED`. Les identifiants de propriétaire,
prix, achats et couvertures ne sont pas acceptés dans ces nouveaux corps.

Les commandes utilisent le verrou de profil commun à la suppression du compte
et aux listes. Résultat rejoué avant contrôle d’une révision ancienne ; une clé
ne peut pas être recyclée entre commande de liste, de modèle ou d’exclusion.
La source, les nouveaux besoins, la commande et la première révision d’une copie
sont enregistrés dans une transaction unique. Un échec annule tout.

## Reprise et validation

Le mobile conserve les commandes par compte et parcours avant envoi. Un refus
explicite libère le formulaire ; une réponse incertaine garde sa clé, méthode
et corps. La suppression d’un modèle peut être reprise même lorsque sa lecture
renvoie désormais 404. Une ancienne réponse ne remplace pas une révision plus
récente du modèle. Les champs restent après erreur ; les doubles appuis sont
bloqués. Les réponses d’un ancien compte ou parcours sont ignorées.

Les tests couvrent droits, isolation, snapshots et nouveaux UUID, achats et prix
non repris, préférences explicites, disparition d’un ingrédient ou produit,
modification/suppression de modèle, conflit de révision, clés croisées, créations
concurrentes, annulation transactionnelle, RLS et suppression de compte. Les
tests calendrier vérifient les exclusions et l’empreinte ; trois lectures
bornées (préférences, repas, ingrédients), sans requête par repas. Les tests
mobiles exercent les formulaires, confirmations, navigation historique, reprise
et états de commandes. Les contrats sont exportés et contrôlés contre TypeScript.

Validation : **suite backend complète, 943 tests réussis et 14 essais OCR réels
ignorés** (opt-in), puis **65 contrôles ciblés réussis**, incluant un cas
supplémentaire de mise à jour concurrente. **215 tests mobiles réussis**,
TypeScript, **44 exports de contrats**, bundles Expo iOS/Android/web et
construction stricte de la documentation réussis.

Les essais manuels iOS/Android et l’accessibilité sur appareils restent à
consigner. Le lint mobile n’est pas configuré. Aucun mode hors connexion complet
n’est annoncé : cache et synchronisation restent à l’étape 11. Les anciennes
listes locales et les accès Accueil/Calendrier gardent les étapes 12–14.

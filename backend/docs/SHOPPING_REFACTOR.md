# Refonte Liste — audit, lots et validation

Cette note conserve l’audit, les décisions, les critères et les validations de
la refonte commencée le 19 novembre 2026. Le [guide des listes](SHOPPING_GUIDE.md)
décrit les parcours courants ; les lots et critères initiaux ci-dessous gardent
leur contexte historique et peuvent être remplacés par les ajustements ultérieurs.

**Contrôle de la base configurée — 20 novembre 2026 :** `alembic current` confirme
`0023_shopping_list_kind (head)` et `alembic check` ne détecte aucune opération
supplémentaire. Aucune migration restante à appliquer lors de ce contrôle.
Les mentions d’absence de déploiement dans les lots décrivent leurs validations
initiales, antérieures à ce contrôle.

## Mise à jour documentaire — 20 novembre 2026

La phrase de période « Repas du… Copie indépendante du calendrier. » est retirée
du détail des listes ; les données de provenance restent conservées.
Le lint est désormais configuré et exécuté en CI. La suite mobile après les
changements de création de recette et de photo Web compte 314 tests réussis,
avec TypeScript et lint sans erreur (111 avertissements existants).
Les résultats de chaque lot ci-dessous restent ceux exécutés à leur livraison.

## État actuel validé par l’utilisateur — 19 novembre 2026

Hamza confirme après ses essais : « J’ai fait les tests, onglet Listes, tout ce
qui concerne les listes est fonctionnel. » L’état courant de Listes est donc
consigné comme fonctionnel selon sa validation manuelle, après les derniers
ajustements et la correction du panier initial. La plateforme et un relevé de
résultats par scénario n’ont pas été précisés. Les mentions d’essais restant à
faire dans les lots ci-dessous décrivent l’état au moment de leur livraison ;
cette confirmation utilisateur est postérieure à ces notes.

Derniers contrôles automatisés déjà réalisés : **1 039 tests backend réussis,
14 ignorés**, **302 tests mobiles réussis**, TypeScript, 47 contrats cohérents
et exports Expo iOS/Android/web valides. Aucun nouveau test n’est requis ni
relancé pour consigner cette confirmation ; aucun code ou contrat n’est modifié.

## Panier initial et répétitions de besoins — correction courante

Un cas de régression avec deux ingrédients et des UUID créés en ordre inverse
reproduisait un panier périmé dès la création. attach calculait son empreinte
avec des choix dans l’ordre des rayons alors que decorate les relit par UUID.
La correction relit l’instantané après insertion des choix, avant les empreintes
et l’enregistrement de la comparaison. Le calcul de prix de la transaction de
création produit ainsi un panier directement utilisable, sans second appui sur
Actualiser les prix. Les quatre scénarios sont testés avec plusieurs produits,
réouverture, rejeu sans recalcul et coches immédiates.

Les blocs Ingrédient · encore quantité sont retirés en bas des listes de
produits, y compris les anciennes listes de produits sans type explicite.
Les quantités, achats, regroupements par magasin et calculs restent conservés.
Le bouton général Actualiser les prix et la présentation des articles restent.

Validation de cette correction : reproduction du défaut avant changement,
puis **1 039 tests backend réussis, 14 ignorés** sur PostgreSQL local jetable,
**302 tests mobiles réussis**, TypeScript, 47 contrats cohérents et exports Expo
iOS/Android/web valides. Lint tenté : ESLint non configuré. Aucun essai visuel
sur appareil effectué pour cette correction ; aucune migration nécessaire.

## Raccordement Calendrier / Épicerie

Le bouton Créer une liste de produits reprend le scénario affiché. Les besoins
non chiffrables sont confirmés avant exclusion et nouveau devis du sous-ensemble ;
le mobile compare les produits/prix/emballages au scénario présenté, le serveur
vérifie ensuite les empreintes calendrier/prix dans from-calendar. Les quatre
scénarios persistent leurs choix explicites pour products et les métadonnées
commerciales, sans modifier le contrat des anciennes créations non typées.

La liste active porte le nom de la semaine (Épicerie 16-22 nov) et s’ouvre via la
pile Listes récentes → fiche. La création ne réutilise pas une liste précédente.
Les lignes de l’aperçu sont rapprochées par ingrédient plutôt que par les UUID
temporaires du devis. Commandes idempotentes persistées, double appui, changement
de semaine/compte et refus de devis sont contrôlés. Aucune migration nouvelle.

Validation de ce raccordement : **1 035 tests backend réussis, 14 ignorés**
sur PostgreSQL local jetable ; **300 tests mobiles réussis**, TypeScript,
47 contrats exportés cohérents et exports Expo iOS/Android/web valides.
Les quatre scénarios, les achats immédiatement cochables, le calendrier source
inchangé, les exclusions partielles, le rejeu idempotent, les prix des lignes,
les doubles appuis et changements de compte sont couverts. ESLint non configuré
(lint tenté, sans installation) ; essai visuel sur appareil restant à effectuer.

## Retrait avec recalcul et quantités — règle courante

Le retrait depuis J’en ai déjà, Ne plus suggérer et Retirer d’une liste products
utilise PATCH item avec refresh_prices=true. Le panier est recalculé au jour
courant dans la même transaction/révision ; toute erreur annule le retrait et
permet la reprise de sa commande. Le bouton général Actualiser les prix reste.

Les produits proposent Définir la quantité avec un nombre entier d’emballages
(product_units), traduit côté serveur selon le format courant, puis recalculé.
Les achats et leurs prix conservés sont déduits sans réécriture. Les articles
proposent Modifier le nom, Définir la quantité, J’en ai déjà, Ne plus suggérer et
Retirer, avec retrait confirmé dans les trois derniers parcours et sans moteur
de prix. La fiche historique des listes mixtes reste compatible. Les sections
antérieures ci-dessous décrivent les états précédents de ces parcours.

Vérification : suite complète backend **1 026 réussis, 14 ignorés**, puis tests
ciblés supplémentaires sur les anciennes listes de produits sans type explicite.
Mobile : **287 tests réussis**, TypeScript et exports iOS/Android/web valides ;
47 contrats exportés cohérents. Lint tenté : ESLint non configuré, sans ajout de
dépendances. Aucun essai visuel sur appareil effectué pour cet ajustement.

## Fiche produit simplifiée — ajustement courant

La fiche produit expose quatre actions : autre magasin (équivalents du même
ingrédient, magasin courant filtré), J’en ai déjà (retrait confirmé), Ne plus
suggérer (préférence d’ingrédient confirmée puis retrait reprenable) et Retirer.
Les confirmations sont affichées dans le panneau pour fonctionner aussi sur web.
Le renommage est bloqué dans le mobile et par PRODUCT_NAME_IMMUTABLE côté API.
Les achats enregistrés, les routes historiques et les options des articles sont
préservés. Le bouton général Actualiser les prix reste sur la liste ; aucun
bouton de recalcul, modification du besoin ou fermeture dans la fiche produit.

Validation de la fiche produit : **285 tests mobiles réussis**, **1 015 tests
backend réussis, 14 ignorés** sur PostgreSQL local jetable ; TypeScript, 47
exports de contrats et exports Expo iOS/Android/web valides. Le lint Expo a été
tenté : ESLint n’est pas configuré, aucune dépendance n’a été ajoutée. Les
confirmations, leur annulation, le retrait refusé/reprenable et le filtrage des
magasins sont couverts par les tests ; contrôle visuel sur appareil à effectuer.

## Mes listes contient uniquement des articles — règle courante

Sauvegarder une liste de produits convertit ses éléments en ingrédients :
nom/catégorie du référentiel si disponible, quantités conservées, aucune
préférence de produit. La liste source et ses achats ne sont pas modifiés.
Les anciennes sauvegardes et anciennes réponses idempotentes sont projetées de
la même façon ; la normalisation est persistée lors d’une prochaine modification,
sans écriture de fond ni nouvelle migration. Utiliser cette liste crée toujours
une copie active d’articles, sans actualisation de prix.

Le menu des sauvegardes propose Ajouter un article. Il réutilise ListQuickAdd
avec recherche d’ingrédients, trois récents et trois suggestions, sélection
immédiate ou validation du texte libre, puis PATCH révisionné. Le formulaire
catalogue/quantité d’ajout est retiré ; les quantités restent modifiables dans
la fiche d’un article existant. Les notes historiques suivantes sont soumises
à cette règle pour toutes les sauvegardes de Mes listes.

Validation de cet ajustement : **1 013 tests backend réussis, 14 ignorés**
sur PostgreSQL local jetable ; **279 tests mobiles réussis** ; TypeScript et
47 exports de contrats cohérents ; exports Expo iOS, Android et web réussis.
Les régressions couvrent la conversion, les anciennes sauvegardes et commandes
rejouées, la conservation de la source et l’ajout par recherche avec PATCH.
Aucun essai visuel sur appareil n’a été effectué pour cet ajustement.

## Sauvegarde simplifiée et retour après utilisation

Le texte Cette liste est épinglée sur ton accueil est retiré, sans modifier la
préférence privée. Le formulaire Enregistrer dans mes listes demande uniquement
le nom ; les choix Panier/Chariot/Feuille/Repas/Maison sont retirés. Le champ icon
historique reste compatible et les anciennes commandes en attente sont conservées.

Les avertissements COPY_PRODUCT_CHOICES ne sont plus répétés par produit dans
le mobile. Une seule note neutre **Veuillez actualiser les prix.** est affichée
pour une liste de produits sans panier frais, puis disparaît après actualisation.
Les autres avertissements et erreurs restent affichés. Actualiser les prix est
réservé aux produits, dans le détail et les options avancées.

Après Utiliser cette liste, la pile est réinitialisée à Listes récentes → copie
créée : le retour ne repasse plus par la sauvegarde ou son formulaire. Les
ressources et achats en base ne sont pas modifiés par ce changement de navigation.
Validation mobile : **278 tests réussis**, TypeScript réussi. Les tests vérifient
la pile de retour et le remplacement ciblé des avertissements, sans cacher une
erreur indépendante. Aucun changement backend ni nouvelle migration.

## Espacement et fin d’ajout

Les indicateurs de l’aperçu rapprochent icône et valeur (4 points) et séparent
les deux groupes (22 points). Le résumé des listes d’articles centre ses compteurs.
Terminé ferme les suggestions et efface le message du dernier ajout ; une saisie
libre restante est enregistrée avant fermeture, et reste visible en cas d’échec.
La phrase Copie indépendante d’une liste sauvegardée est retirée du détail,
sans modifier la provenance en base. Aucun changement backend ni migration.

## Parcours courant des copies et ajustements d’affichage

Le montant réaffiche **$** après sa valeur. Dans le détail, le total est centré
sur la troisième ligne du résumé, sous les compteurs. L’aperçu réaffiche les
magasins avec une icône, sans réintroduire le total d’éléments.

Les suggestions sont limitées à trois résultats par page, avec remplacement
sur Suivants/Précédents ; les récents sont trois lignes du même style, isolées
par compte et type. Les récents produits gardent leur product_id stable pour
qu’une réutilisation reste un choix produit, sans prix local inventé.

Les récentes et Toutes les listes demandent collection=current au serveur.
Terminer une copie utilise complete, la retire du parcours courant puis retourne
à Listes récentes. La source sauvegardée reste intacte. Utiliser cette liste
appelle instantiate avec activate=true puis ouvre l’identifiant de la copie.
Seuls les paramètres de la sauvegarde offrent sa suppression confirmée. Les
achats et anciennes routes backend restent conservés ; aucune suppression SQL
ni migration supplémentaire n’est effectuée.

Accueil utilise une destination de navigation explicite (index des listes puis
ShoppingDetail avec l’identifiant choisi), même avant montage de la pile protégée.
Le contrôle d’accès ne démonte plus une pile déjà autorisée pendant une simple
revérification ; un refus du serveur continue de bloquer le contenu. Les copies
actives ne sont plus masquées automatiquement selon la date technique des prix.

Les tests couvrent l’ouverture depuis une ligne réelle d’Accueil, la conservation
de la pile pendant la revérification et son blocage sur refus, les trois lignes de
suggestions et récents, le filtre current, l’instanciation et l’ouverture d’une
copie active, puis le retour aux récentes lors de sa fin sans DELETE de source.
Validation : **277 tests mobiles réussis**, TypeScript et exports Expo iOS, Android et Web réussis. Aucun script lint configuré ; les essais natifs restent à effectuer. Les validations backend antérieures restent celles de 0023 (backend inchangé).

## Simplification et fin des courses

Les récentes conservent uniquement le compteur À acheter : suppression du total
d’éléments et du nombre de magasins. Le résumé du détail retire le montant Reste
connu à acheter. Pour une liste active non vide dont le restant est zéro,
**Terminer la liste** apparaît avant Actualiser les prix ; il utilise la commande
complete existante avec révision/idempotence, sans effacer les achats. Les listes
vides ou déjà terminées n’affichent pas cette action, et les ajouts/commandes en
cours la désactivent.

La suppression d’une sauvegarde fermait le Modal puis appelait Alert immédiatement.
La confirmation est désormais affichée dans l’écran, après fermeture du menu,
pour éviter cette concurrence de présentations natives et fonctionner aussi sur
le Web. Les anciennes sauvegardes (`kind` absent ou NULL) transmettent le même
DELETE révisionné. Annuler n’écrit rien ; réponse incertaine = reprise exacte de
la commande. Le serveur et ses règles de suppression logique sont conservés.
Aucune ancienne liste réelle n’a été supprimée pour vérifier ce correctif.

TypeScript et les **272 tests mobiles** passent. Les tests couvrent les trois formes de type (absent, nul, products),
confirmation/annulation, reprise d’une suppression déjà reçue et conditions de
fin des courses. Aucun changement backend ou nouvelle migration.

## Derniers ajustements visuels

Le titre devient **Listes**. Les récentes n’affichent plus Articles/Produits · En
cours : elles présentent le nombre total d’éléments, le reste à acheter et les
magasins avec des icônes et libellés accessibles. Le montant reste à droite sous
Total estimé/Sous-total connu, sans icône ni symbole $. Les magasins sont
comptés par couple enseigne/succursale, sans doubler les références ou compter
les anciennes propositions périmées ; les achats conservés restent inclus.

Dans le détail, statut et compteurs sont regroupés dans un résumé avec icônes.
Les mentions isolées Liste en cours et Liste de produits · prix estimés sont
retirées. La note Prix au … est déplacée en fin de contenu dans un bloc vert.
Modifier et Fermer disparaissent du menu ; les fiches gardent l’édition et une
section repliée Articles/Produits retirés conserve la restauration. Le fond et le
retour Android ferment toujours le menu. L’explication sur les articles libres
est raccourcie dans la recherche produit.

Aucune modification backend ni migration supplémentaire. TypeScript et les 267
tests mobiles passent pour cette passe ; les validations backend précédentes
restent celles de la livraison 0023. Les essais natifs restent à effectuer.

## Application de la migration 0023

À la demande explicite de l’utilisateur, la migration a été appliquée à la base
configurée du backend : passage de `0022_product_follows` à
`0023_shopping_list_kind (head)`. `alembic current` confirme la nouvelle révision
et `alembic check` ne détecte aucune opération supplémentaire. Les colonnes et
contraintes correspondent aux modèles ; aucune commande de suppression de données
n’a été exécutée. Les mentions « non appliquée à distance » ci-dessous décrivent
l’état antérieur à cette autorisation et à cette application.

## Ajustements courants : listes d’articles ou de produits

Cette section remplace les descriptions de présentation de la première refonte
conservées plus bas comme historique des lots.

- Historique retiré de l’écran principal, sans effacer les anciennes listes.
  Listes récentes affiche les cinq dernières modifications tous statuts confondus.
  Au-delà de cinq, Voir tout en bas à gauche ouvre Toutes les listes avec pagination.
- + circulaire de 48 points en haut à droite du titre Liste ; choix explicite
  Liste d’articles ou Liste de produits, avec une courte explication, puis création
  persistante vide. Mes listes reste réservé aux sauvegardes réutilisables.
- Lignes distinguées par icône, libellé Articles/Produits et accent vert/bleu,
  sans reposer uniquement sur la couleur. Montant des produits à droite avec $,
  légendé total ou sous-total ; prix inconnu jamais transformé en zéro.
- Aucune date de courses ni En retard dans les listes. La date technique des prix
  reste interne et peut être indiquée comme date du prix, sans imposer un rendez-vous.
- Articles : ingrédients ou texte libre validé par Entrée/Terminé, sans prix.
  Produits : uniquement des résultats commerciaux directement cliquables ; aucun
  ajout générique/libre. Retour Android ferme sans enregistrer.
- Actualiser les prix proposé aux produits après Terminé, désactivé pendant les
  ajouts ; recalcul au jour courant, références et achats sauvegardés conservés.

### Persistance et compatibilité

La migration **0023_shopping_list_kind**, après 0022, ajoute `kind` nullable sur
`shopping_list` et `shopping_list_template`, avec contrainte SQL. Les nouvelles
listes mobiles envoient articles ou products ; le type est immuable. Le point de
commit commun refuse tout mélange (422 LIST_KIND_CONFLICT) et annule la transaction,
y compris pour les anciennes routes de comparaison ou restauration d’un article.
Une liste de produits sans prix valide reste une liste de produits identifiés.

Les anciennes listes et anciens appels sans type restent `kind: null` : aucune
réécriture des achats, statuts, snapshots ou commandes idempotentes. Le mobile
identifie les anciennes listes mixtes et empêche leurs nouveaux ajouts. Leurs
achats et fonctions de consultation restent conservés. Les sauvegardes nouvelles
conservent leur type ; celles de produits conservent les références lors de la
réutilisation, sans recopier prix/achats/possession.

`POST .../recalculate-prices` accepte `refresh_date: true` et utilise le jour
courant dans la même transaction. Le choix ciblé dans products utilise aussi le
jour courant. Aucun nouvel endpoint métier et aucune dépendance mobile ajoutés.
Les routes historiques restent disponibles. Les types JSON/OpenAPI sont régénérés.

**Déploiement : appliquer 0023 avant de démarrer cette version du backend.**
La migration a été exécutée uniquement sur PostgreSQL local jetable, jamais sur
Supabase distant. Depuis la racine, avec le venv et la base ciblée correctement
configurés :

```bash
python -m alembic -c backend/alembic.ini upgrade head
```

### Contrôles des ajustements

La régression complète donne **1 010 tests backend réussis, 14 OCR optionnels ignorés**, et **264 tests mobiles réussis**. TypeScript et les exports Expo iOS, Android et Web passent ; les 47 exports de contrats sont cohérents. Les essais natifs restent à effectuer. Les tests couvrent cinq récentes,
Voir tout à gauche, absence d’Historique/date, sélecteur de type, séparation des
suggestions, ajout libre réservé aux articles et activation du bouton de prix
après fermeture des suggestions. Aucun script lint configuré ; le passage
`npm run lint --if-present` ne constitue pas un contrôle lint.

Les 13 tests rapides backend passent, dont six nouveaux cas : persistance/rejeu
des deux types, refus atomique produit→articles, refus générique→produits,
interdiction de supprimer une sélection explicite, actualisation au jour courant
avec conservation des achats et réutilisation d’une sauvegarde de produits.
Le contrôle Alembic/metadata et RLS passe sur la base jetable. Les deux anciennes
assertions de tête Alembic sont mises à jour de 0022 vers 0023.

Fichiers supplémentaires à ceux des lots ci-dessous : migration 0023, modèles
et schémas typés, validation commune de service, réutilisation typée, refresh_date
dans le recalcul, nouvel écran ShoppingAllListsScreen, navigation et tests associés.
Le guide [guide des listes](SHOPPING_GUIDE.md) décrit les parcours courants. Les
critères AC de la mission initiale ci-dessous restent l’état de cette première
livraison ; dates/retard et comparaison des articles sont remplacés par les
nouvelles demandes explicites de l’utilisateur.

## Ajustements de présentation après refonte

L’interface courante utilise deux sections **Listes récentes** et **Mes listes**,
sur le modèle du sélecteur de Recettes. Mes listes affiche **Il s’agit de vos listes
sauvegardées.** et remplace Mes modèles. **Enregistrer dans mes listes** remplace
Utiliser comme modèle ; les formulaires et le détail utilisent le même vocabulaire.
Les routes, types et données backend des modèles sont conservés, sans migration.
**Utiliser cette liste** crée une nouvelle liste de courses indépendante.

Les résultats produits sont directement cliquables. Les boutons Choisir ce produit,
Ajouter l’article sans produit et Ajouter comme article libre sont retirés. Sans
sélection, Entrée ou Terminé valide le texte comme article libre (`ingredient_id:
null`), y compris si le catalogue propose un nom identique. Aucun ajout n’a lieu
sur une simple frappe ou perte de focus ; retour Android ferme sans ajouter.
Le verrou d’ajout et la reprise idempotente restent utilisés.

Validation de ces ajustements : **261 tests mobiles réussis**, TypeScript réussi.
Aucun script lint configuré (`npm run lint --if-present` ne lance aucun contrôle).
Les sections ci-dessous consignent les lots initiaux ; les nouveaux libellés et
parcours sont détaillés dans [guide des listes](SHOPPING_GUIDE.md).

## Lot 0 — audit

| Flux actuel | Contraintes constatées dans le code | Changement retenu |
| --- | --- | --- |
| Création manuelle en deux pages | `ShoppingListCreate.items` accepte zéro élément, `pricing` est facultatif ; seul `service.create_list` refuse une liste active vide. Aucune contrainte SQL n’exige un article. | Autoriser l’actif vide sans migration ; garder les statuts et contrats anciens. |
| Ajout depuis Modifier | `POST /items` accepte nom libre, quantité facultative et ingrédient sans choix produit ; fusion explicite `add` ou `separate`. | Ajouter une barre inline réutilisant les commandes privées et proposant la fusion. |
| Suggestions | Ingrédients paginés avec `q` ; offres paginées mais sans `q`. | Ajouter le filtre public `q` aux offres ; requêtes bornées et différées, sans nouveau moteur ni chargement complet mobile. |
| Prix | Sans `assignment`, aucun produit choisi ; les montants numériques seuls ne suffisent pas à distinguer l’absence de chiffrage d’un zéro réel. | Déduire l’état d’affichage du panier et des achats produits ; masquer les totaux des listes génériques. |
| Coches | Achat manuel sans prix et achat de produit sont déjà distincts ; le serveur calcule la couverture. | Conserver ces deux commandes, alléger les lignes, offrir un retour d’attente et rétablir l’état confirmé en erreur. |
| Comparaison | `price-options` est une lecture directe ; `recalculate-prices` écrit et préserve les achats. Les anciennes comparaisons vérifiées restent disponibles. | Comparateur optionnel avec aperçu puis application explicite, sans retirer les routes historiques. |
| Produit choisi | Le recalcul direct chiffre aujourd’hui tous les besoins compatibles. | Ajouter un choix ciblé atomique qui ne chiffre que les références explicitement retenues et les produits déjà appliqués. |
| Calendrier | Aperçu avec empreinte, portions, exclusions et provenance ; création sans `pricing` déjà possible. | Conserver cet aperçu, enlever la revue obligatoire des prix. |
| Modèle | `instantiate` existe, renvoie une copie en brouillon sans achats ni prix. | Ajouter son accès mobile puis activation explicite dans la même commande serveur si demandée. |
| Sécurité | JWT, propriétaire, révision attendue, clé idempotente et commandes locales de reprise. | Conserver ces garanties pour toutes les mutations. Aucun changement de données anciennes. |

Les cinq onglets et React Navigation sont conservés. Les dépendances existantes
suffisent ; aucune nouvelle bibliothèque UI/navigation n’est prévue. Les listes
ne deviennent pas utilisables hors connexion. Les changements déjà présents dans
les README et les fichiers de mission sont préservés.

## Checkpoints

- Lot 0 : 995 tests backend réussis, 14 OCR optionnels ignorés, PostgreSQL local
  jetable ; TypeScript et 252 tests mobiles passent avant modifications.
- Lot 1 : création active vide autorisée sans migration ; création instantanée
  réelle et reprise manuelle ; ajout inline d’ingrédient ou de texte libre,
  suggestions différées et paginées. Les 35 tests stockage/HTTP passent sur
  PostgreSQL local. Le formulaire calendrier conserve provisoirement ses prix
  obligatoires jusqu’au lot 4. Aucun montant n’est envoyé par le client.
- Lot 1 mobile : TypeScript et 254 tests réussis. Fichiers principaux : création,
  `InstantListCreation`, `ListQuickAdd`, API annulable et service de création.
- Lot 2 : lignes compactes, achats dépliables, possession et achats partiels sous
  Options avancées ; retour de coche en cours puis état serveur. Résumé partagé
  sans prix pour une liste générique. Les 39 tests backend courses/recalcul passent.
  Les tests mobiles d’ancienne présentation sont adaptés aux libellés explicites.
- Lot 3 : aperçu facultatif dans `ShoppingComparisonScreen`, application avec
  révision/empreinte/confirmation ; filtre `q` des offres, ajout avec produit
  explicite atomique et route `selected-product`. Les 81 tests backend ciblés
  passent (y compris création historique et recalcul). Aucun montant client.
  Les métadonnées du produit choisi sans prix sont stockées dans le JSON du panier
  existant ; champs optionnels avec valeurs par défaut, donc aucune migration.
- Lot 4 : création calendrier sans prix obligatoire, période conservée,
  dates modifiables et résumé partagé Accueil/Liste. Aucun ajout automatique dans
  une liste de période existante : elle s’ouvre, évitant de dupliquer des besoins.

## Risques à vérifier

Réponse perdue pendant une création ou un ajout, ajout répétitif sans quantité,
achat partiel d’un groupe, produit sans prix valide, changement de promotion,
conflit entre appareils, ancien panier avec achats, changement de compte pendant
une suggestion, clavier et lecteur d’écran sur appareil.

## Livraison des lots 4 et 5

Le lot 4 est terminé : l’aperçu calendrier conserve période, portions, exclusions,
provenance et empreinte, puis crée les besoins sans panier obligatoire. La date
préremplie reste modifiable à la création calendrier et dans Renommer la liste.
Accueil et Liste utilisent `ListSummaryRow` et le même budget légendé. La vue
Épicerie ouvre la liste de période exacte ou la confirmation des besoins ; elle
n’ajoute pas automatiquement une seconde fois les ingrédients.

Le lot 5 ajoute le bouton d’instanciation dans le détail d’un modèle, avec une
commande active explicite et sans achats/possession/prix hérités. Les récents
locaux, limités à huit noms/identités, sont enregistrés seulement après un ajout
confirmé et sont isolés par compte. Il n’existe aucune statistique de popularité
fiable ni favoris d’articles : ces fonctionnalités P2 sont différées. Historique
reste après les listes en cours avec trois lignes puis Voir tout.

## Avant / après et description des parcours

| Parcours | Avant | Après |
| --- | --- | --- |
| Nouvelle liste manuelle | Saisir des besoins → Suivant → prix/scénario → créer | Toucher Créer une liste → liste vide réellement enregistrée et ouverte ; aucune décision supplémentaire obligatoire |
| Trois articles | Formulaire Modifier, saisie/validation pour chaque article | Une barre dans le détail ; saisir lait, œufs, pain et toucher chaque ingrédient. Le champ reste prêt pour le suivant |
| Courses génériques | Contrôles de couverture au milieu de cartes détaillées | Une case par ligne ; un toucher par achat, Achetés dépliable ; fiche pour les opérations avancées |
| Prix | Deuxième page obligatoire de création | Aucun écran de prix obligatoire ; Comparer les prix → consulter → Appliquer et confirmer si souhaité |
| Depuis Calendrier | Besoins → prix → scénario → création | Période conservée → vérifier/corriger les besoins → créer ; aucun choix de prix obligatoire |
| Depuis un modèle | Instanciation disponible uniquement au serveur | Créer une liste avec ce modèle → nouvelle liste active indépendante |

Les listes génériques ne montrent ni photo commerciale ni montant. Un résultat
produit montre magasin/format/photo disponible et distingue Ajouter l’article de
Choisir ce produit. Un produit sans prix conserve son identité mais affiche Prix
indisponible. Le comparateur présente Moins cher puis les enseignes ; Voir les
produits les regroupe par magasin. Les besoins inconnus restent signalés.

Les captures natives n’ont pas pu être réalisées : `xcrun simctl list devices
available` ne trouve aucun appareil, et `adb` n’est pas installé. Les descriptions
ci-dessus constituent le livrable de parcours ; elles ne valent pas validation
visuelle. Aucun objectif de durée ou résultat de test utilisateur n’est revendiqué.

## Contrats, compatibilité et données

- Création : `items: []` avec `activate: true` devient valide. Le défaut demeure
  brouillon pour les anciens clients. Aucun statut ancien n’est converti.
- Ajout : `ShoppingItemAdd.product_id` optionnel, lié à un ingrédient obligatoire
  si renseigné ; ajout et choix dans une transaction. Sans produit, aucun prix
  n’est chargé ni choisi.
- Nouveau `PUT /api/v1/shopping-lists/{id}/items/{item_id}/selected-product` :
  `expected_revision` et `product_id`, même sécurité et idempotence que les autres
  mutations. Il conserve les achats et ne chiffre pas les autres besoins génériques.
- `recalculate-prices` : `expected_fingerprint` optionnel et `accept_partial`
  par défaut faux. Avec empreinte, refus 409 si l’aperçu a changé ; acceptation
  explicite nécessaire pour un panier partiel. Anciens appels compatibles.
- Panier : `selected_products` optionnel, dictionnaire par `product_id`, vide par
  défaut. Instantanés dans le JSON existant, y compris identité d’un produit
  choisi sans prix, sans fabriquer une ligne chiffrée.
- `instantiate` : `activate` optionnel, faux par défaut. Nouvelle copie active
  lorsque demandé, sans reproduire les achats, la possession ou les prix.
- Lecture publique `GET /api/v1/offers` : `q` borné à 200 caractères, noms des
  produits et noms/alias des ingrédients ; filtres et pagination conservés.

**Migration : aucune.** Le modèle/SQL accepte déjà zéro article et le JSON de
panier supporte les champs optionnels. Les contrats OpenAPI/JSON sont régénérés.
Aucune route historique, comparaison, attestation, achat ou commande de reprise
n’est supprimé. Aucun accès ni migration sur Supabase distant n’a été exécuté.
Les achats conservent leur prix enregistré lors d’un recalcul ou changement produit.

## Fichiers par lot

| Lot | Fichiers principaux créés ou modifiés |
| --- | --- |
| 0 | Cette note ; audit des routes, modèles, migrations et composants existants |
| 1 | `service.py`, `CreateListScreen.tsx`, nouveau `InstantListCreation.tsx`, nouveau `ListQuickAdd.tsx`, `services/api.ts`, tests stockage et création mobile |
| 2 | `ListScreen.tsx`, `ListSummaryRow.tsx`, `ListCourses.tsx`, `ListArticleSheet.tsx`, `ProductPurchase.tsx`, `SavedListCard.tsx`, nouveaux `ShoppingListItemRow.tsx`, `ShoppingPriceSummary.tsx`, `shoppingPresentation.ts`, tests overview/courses |
| 3 | `schemas.py`, `router.py`, `recalculation.py`, `common/public_router.py`, nouveau `ShoppingComparisonScreen.tsx`, `ListProductAlternatives.tsx`, `ShoppingListDetailScreen.tsx`, `App.tsx`, types navigation/listes, contrats exportés, nouveau `test_shopping_quick_flow.py`, `test_shared_contracts.py`, `listRecalculation.test.cjs` |
| 4 | `CreateListScreen.tsx`, `HomeScreen.tsx`, `EpicerieSemaine.tsx`, `ShoppingListDetailScreen.tsx`, tests access/reuse/visitor |
| 5 | `reuse.py`, `reuse_schemas.py`, `ShoppingTemplateDetailScreen.tsx`, nouveau `shoppingRecents.ts`, `test_shopping_reuse.py`, nouveau `listQuickFlow.test.cjs` |
| Documentation | `README.md`, `README-fonctionnement.md`, `SHOPPING_GUIDE.md`, `backend/README.md`, `SHOPPING_LISTS_CONTRACTS.md`, cette note |

Les chemins backend métier sont sous `backend/app/shopping_lists`, les écrans
sous `mobile/app`, les composants sous `mobile/components/lists` et les services
sous `mobile/services`. La répartition ci-dessus décrit les étapes réalisées ;
aucun commit ni push n’a été effectué. Les modifications README préexistantes
ont été conservées et actualisées.

## Résultats réellement exécutés

| Contrôle | Résultat |
| --- | --- |
| Backend avant refonte | 995 réussis, 14 ignorés |
| Lot 1 : stockage et HTTP | 35 réussis ; mobile 254 réussis et TypeScript |
| Lot 2 : courses et recalcul | 39 réussis ; assertions mobiles adaptées aux lignes compactes |
| Lot 3 : création, choix ciblé, recalcul, offres | 81 réussis ; régressions mobiles corrigées |
| Lots 4–5 et régression finale backend | **1 004 réussis, 0 échec, 14 OCR optionnels ignorés**, 7 avertissements |
| Régression finale mobile | **259 réussis, 0 échec, 0 ignoré** |
| TypeScript | `npm run typecheck` réussi |
| Contrats | 47 exports régénérés et vérifiés par les tests |
| Bundles Expo | Exports iOS, Android et Web réussis |
| Lint | Aucun script lint configuré dans `mobile/package.json` ; aucun résultat lint revendiqué |
| Essais natifs et utilisateurs | Non exécutés, simulateurs/appareils indisponibles ; objectifs UX non mesurés |

Les tests backend utilisent exclusivement un PostgreSQL local jetable avec
`OPTIMEAL_TEST_DATABASE_URL`. La suite complète comprend les vérifications
existantes d’autorisation, révisions, reprise idempotente, prix/promotion,
achats partiels, possession, historique, calendriers et modèles. Les tests
nouveaux couvrent ajout générique sans lecture des prix, choix ciblé atomique,
produit sans prix, rollback sur choix invalide, aperçu sans écriture, empreinte
périmée, panier partiel et conservation d’un achat lors d’un nouveau choix.

Les tests mobiles exécutent les composants avec des hooks et dépendances
contrôlés : ils vérifient temporisation/annulation, isolation d’une réponse
ancienne après changement de compte, saisie conservée en échec, doubles appuis,
choix générique/produit, reprise des commandes, confirmation et retour sans
application. Ils ne remplacent pas le rendu React Native, le tactile, le clavier
ou VoiceOver/TalkBack sur un vrai appareil.

Commandes de reproduction (base de test jetable déjà créée) :

```bash
# Racine : renseigner une URL PostgreSQL de test, jamais la production.
OPTIMEAL_TEST_DATABASE_URL='postgresql+psycopg://postgres@127.0.0.1:55439/optimeal_test_merge_20261119' .venv/bin/python -m pytest backend/tests -q
.venv/bin/python -m backend.cli.export_shared_contracts

cd mobile
npm run typecheck
npm test
CI=1 npm exec -- expo export --platform ios --platform android --platform web --max-workers 2 --output-dir /tmp/optimeal-liste-refactor-export
```

## Critères d’acceptation

**Vérifié** désigne un scénario automatisé exécuté, pas un essai sur téléphone.
**Partiel** indique une couverture de contrat/composant sans validation réelle du
parcours complet ou de son rendu. Aucune performance utilisateur n’a été mesurée.

| Critère | Statut | Preuve / limite |
| --- | --- | --- |
| AC-01 | Vérifié | API active vide persistée + composant de création immédiate, sans panier |
| AC-02 | Partiel | Ressource relue en base et accessible par l’index ; fermeture/réouverture native non exécutée |
| AC-03 | Vérifié | Ajout ingrédient sans produit, sans chargement des prix ; résumé sans faux zéro |
| AC-04 | Vérifié | Texte libre sans `ingredient_id` inventé et saisie préservée en échec |
| AC-05 | Vérifié | Identité stable, sélection atomique, instantané du produit sans prix et rollback invalide |
| AC-06 | Partiel | Achat/décochage serveur et rollback visuel contrôlé ; parcours tactile de trois articles non exécuté |
| AC-07 | Vérifié | Résumés et lignes génériques sans prix ; action de comparaison séparée |
| AC-08 | Vérifié | Budget incomplet légendé Sous-total connu et nombre d’articles sans prix |
| AC-09 | Vérifié | Options sans mutation, scénarios, date et inconnus ; tests backend/mobile |
| AC-10 | Vérifié | Confirmation, révision, empreinte, panier partiel et conservation des achats |
| AC-11 | Vérifié | Retour du comparateur sans commande d’écriture |
| AC-12 | Vérifié | Période conservée, portions agrégées et création calendrier sans étape prix |
| AC-13 | Vérifié | Contrats calendrier notes/restes/inaccessibles et confirmation des exclusions |
| AC-14 | Vérifié | Résumé En retard ; statut changé seulement par commande explicite |
| AC-15 | Vérifié | Même composant de résumé partagé par Accueil et Liste |
| AC-16 | Vérifié | Relecture idempotente création/ajout/choix et commandes mobiles à réponse incertaine |
| AC-17 | Vérifié | Conflit de révision et aperçu périmé refusés sans écrasement |
| AC-18 | Partiel | Accès propriétaire, stockage par compte et réponses tardives contrôlés ; transition réelle d’appareil non exécutée |
| AC-19 | Vérifié | Recalcul explicite et tests de conservation des instantanés achats/promotions |
| AC-20 | Partiel | Gestion d’erreur et reprise testées ; coupure réseau réelle d’un appareil non exécutée |
| AC-21 | Partiel | Labels, rôles, états et cibles de coche/ajout ≥48 prévus ; lecteurs d’écran et grandes polices non vérifiés sur appareil |
| AC-22 | Non vérifié | KeyboardAvoidingView, scroll conservant les taps, Terminé et retour Android implémentés ; clavier natif non essayé |
| AC-23 | Vérifié | Suite existante complète stockage, courses, historique, réouverture et compatibilité contrats |
| AC-24 | Partiel | Instanciation active backend et types mobile validés ; bouton natif non essayé |

## Décisions UX et limites restantes

La date reste préremplie et modifiable, conformément au contrat existant ; aucun
changement de nullabilité n’a été introduit. L’ajout rapide ne demande pas de
quantité : sa modification reste dans la fiche. Les options de possession et
achat partiel sont conservées sous Options avancées. Les photos sont réservées
aux produits réellement choisis. Le vert et les composants existants sont réutilisés,
sans nouvelle dépendance ni remplacement de navigation.

Les prix restent des estimations datées sans garantie de caisse ou de stock. Un
produit ciblé peut actualiser les prix des références déjà retenues, jamais choisir
implicitement les autres ingrédients ; ce comportement est expliqué dans les
suggestions. Le retour au choix automatique et le recalcul avancé conservent leur
sémantique historique et peuvent recalculer les autres besoins compatibles.

À réaliser sur iOS et Android : recherche sous clavier, retour, suggestions longues,
focus après ajout, achat partiel puis changement de produit, reprise après coupure,
grande police, VoiceOver/TalkBack, changement de compte. Organiser ensuite les
tests utilisateurs prévus par la mission et consigner les temps/erreurs observés.
La première page filtrée localement sur Accueil et la préférence d’épinglage non
utilisée par cet écran sont des limites préexistantes conservées.


## Référence des critères initiaux et objectifs UX

Les critères ci-dessous sont conservés pour interpréter les identifiants AC
du bilan précédent. Ils décrivent la demande initiale : la séparation immuable
Articles / Produits, la création de produits depuis Calendrier et le retrait des
dates de courses dans le mobile remplacent notamment les parcours AC-07, AC-09,
AC-12 et AC-14. Le guide courant fait référence pour les nouvelles régressions.

| ID | Scénario | Résultat attendu |
|---|---|---|
| AC-01 | Compte connecté, touche `Créer une liste` | Une liste vide **persistée** s’ouvre, sans choix de prix ni article obligatoire. |
| AC-02 | Crée une liste et ferme/réouvre l’application | La liste est toujours accessible depuis Mes listes. |
| AC-03 | Tape `lait`, touche l’ingrédient générique | Ligne « Lait » ajoutée immédiatement, **sans photo commerciale, sans prix et sans total inventé**. |
| AC-04 | Tape un terme inexistant puis « Ajouter … comme article libre » | Article libre ajouté, sans fausse association catalogue. |
| AC-05 | Tape `riz`, choisit un produit commercial réel | Produit précis avec magasin, format, photo si disponible, prix seulement si applicable ; choix explicite conservé. |
| AC-06 | Ajoute 3 articles et les coche | Chaque coche marque l’achat correctement en un toucher, section Achetés actualisée ; décocher est possible. |
| AC-07 | Ajoute 3 articles génériques sans produit | Aucun total `0 $` ni estimation erronée ; comparaison facultative visible. |
| AC-08 | Associe 2 produits chiffrés et laisse 1 besoin sans prix | Affichage « Sous-total connu » et mention du besoin non chiffré, pas « Total estimé » trompeur. |
| AC-09 | Ouvre Comparer les prix | Options Moins cher et magasins, données datées, articles inconnus signalés ; la liste n'est pas changée automatiquement. |
| AC-10 | Applique un scénario | Confirmation explicite, nouveaux produits enregistrés, préférences/achats antérieurs respectés selon contrat. |
| AC-11 | Retourne du comparateur sans appliquer | Liste et choix antérieurs inchangés. |
| AC-12 | Calendrier contient des recettes et portions | Création de liste avec ingrédients agrégés sans imposer une deuxième revue de prix. |
| AC-13 | Calendrier contient notes libres/restes/recettes indisponibles | Exclusions/limitations signalées, aucune quantité inventée. |
| AC-14 | Liste prévue à date passée | Affiche En retard, reste active jusqu'à action explicite de fin. |
| AC-15 | Accueil et Liste montrent la même liste | Libellés de montant non contradictoires, cohérence des nombres d’articles restants. |
| AC-16 | Un envoi réussit mais la réponse réseau se perd | Reprise idempotente ; aucune seconde liste ni deuxième article dupliqué. |
| AC-17 | Autre appareil modifie la liste pendant une édition | Gestion explicite du conflit ; aucune modification écrasée silencieusement. |
| AC-18 | L'utilisateur A se déconnecte et B se connecte | Aucune suggestion/donnée privée de A visible pour B. |
| AC-19 | Prix ou promotion change | Recalcul explicite, prix antérieurs des achats déjà sauvegardés préservés. |
| AC-20 | Pas d'Internet / API indisponible | État erreur et Réessayer, jamais un faux succès ni un faux état vide. |
| AC-21 | VoiceOver / TalkBack et grandes polices | Champs, suggestions, coche, quantité, prix inconnu, CTA et états sont étiquetés et activables. |
| AC-22 | Utilisation iOS/Android avec clavier affiché | Suggestions visibles et sélectionnables, pas de recouvrement des contrôles, retours fonctionnels. |
| AC-23 | Anciennes listes actives/terminées/brouillons avec achats | Lecture, édition autorisée, historique et réouverture sans régression des données. |
| AC-24 | Depuis un modèle, « Créer une liste avec ce modèle » (P2) | Nouvelle liste d’articles sans copier achats/possessions ni prix historiques. |

**Mesures UX proposées pour test utilisateur (objectifs, pas preuves acquises) :** création d'une liste + ajout de 3 articles sans aide en moins d'une minute ; zéro visite obligatoire dans l'écran Prix ; la majorité des testeurs comprennent sans explication la différence entre article et produit. Faire un test avec au moins quelques personnes extérieures à l'équipe ; noter temps, erreurs, hésitations et succès plutôt que déclarer les objectifs atteints sans mesure.

Les principes UX retenus sont la cohérence avec les composants existants, la
visibilité de l’enregistrement, la prévention des erreurs et la présentation
des options avancées à la demande. Les cibles visent au moins 44 pt sur iOS
et 48 dp sur Android ; le clavier, le texte agrandi et VoiceOver/TalkBack
restent à vérifier sur appareil. Ces objectifs ne constituent pas des mesures
d’utilisabilité déjà réalisées.

# Fonctionnement détaillé de l’onglet Liste

Ce document décrit le fonctionnement présent dans le code au **20 novembre 2026**, après la refonte de Liste et l’intégration des changements de `main`. Il couvre les écrans, les actions, les calculs, la sauvegarde et les erreurs. Les parcours accessibles dans le mobile sont distingués des fonctions disponibles uniquement côté serveur.

Les exemples de prix sont des données d’explication, pas des prix actuels en magasin. La lecture du code ne remplace pas une validation visuelle et fonctionnelle sur iOS et Android.

## Sommaire

1. [Rôle de Liste et notions principales](#1-rôle-de-liste-et-notions-principales)
2. [Accès, connexion et navigation](#2-accès-connexion-et-navigation)
3. [Page principale](#3-page-principale)
4. [Création et ajout selon le type](#4-création-et-ajout-selon-le-type)
5. [Création depuis le calendrier](#5-création-depuis-le-calendrier)
6. [Produits et prix](#6-produits-et-prix)
7. [Logique des calculs](#7-logique-des-calculs)
8. [Enregistrement de la liste](#8-enregistrement-de-la-liste)
9. [Détail et organisation des courses](#9-détail-et-organisation-des-courses)
10. [Fiche d’un article](#10-fiche-dun-article)
11. [Achats, possession et quantités partielles](#11-achats-possession-et-quantités-partielles)
12. [Actualisation et changement de produit](#12-actualisation-et-changement-de-produit)
13. [Menu de la liste et modification des articles](#13-menu-de-la-liste-et-modification-des-articles)
14. [Fin des courses et listes terminées](#14-fin-des-courses-et-listes-terminées)
15. [Listes sauvegardées](#15-listes-sauvegardées)
16. [Ingrédients non suggérés](#16-ingrédients-non-suggérés)
17. [Accès depuis Accueil et Calendrier](#17-accès-depuis-accueil-et-calendrier)
18. [Erreurs, concurrence et reprise](#18-erreurs-concurrence-et-reprise)
19. [Présentation et accessibilité](#19-présentation-et-accessibilité)
20. [Architecture, API et fichiers utiles](#20-architecture-api-et-fichiers-utiles)
21. [Parcours de vérification](#21-parcours-de-vérification)

## 1. Rôle de Liste et notions principales

Liste sert à préparer une épicerie, choisir des produits dans le catalogue des magasins, enregistrer un panier et suivre les achats. Une même personne peut conserver plusieurs listes privées.

| Notion | Signification | Exemple |
| --- | --- | --- |
| Ingrédient | Référence commune utilisée par les recettes et le catalogue | Riz |
| Article | Ligne de besoin dans une liste, liée ou non à un ingrédient | Riz, 750 g ; sacs à déchets sans quantité |
| Produit | Référence commerciale d’une enseigne et d’une succursale | Sac de riz de 500 g chez Maxi |
| Besoin | Quantité totale souhaitée pour l’article | 750 g |
| Possession | Quantité déclarée déjà disponible pour cette liste | 250 g à la maison |
| Achat de produit | Nombre de produits déclaré acheté avec le prix sauvegardé | Un sac de 500 g |
| Achat sans prix | Déclaration de couverture sans montant connu | 500 g achetés ailleurs |
| Panier ou scénario | Répartition de produits choisie pour chiffrer les besoins | Maxi, Metro, Super C ou Moins cher |
| Liste sauvegardée | Ensemble de besoins réutilisable, stocké par l’API historique des modèles | Barbecue, voyage, fête |

Une liste est une ressource enregistrée sur le serveur. Elle n’est pas une vue qui se réécrit automatiquement lorsque le calendrier change. La possession concerne cette liste ; elle ne constitue pas un garde-manger global.

## 2. Accès, connexion et navigation

### Conditions d’entrée

L’ensemble du navigateur Liste est protégé par `ListAccessRequired`.

1. Sans session, l’application propose la connexion : « Connecte-toi pour accéder à tes listes. »
2. Avec un compte, elle vérifie une lecture privée auprès du serveur : `GET /api/v1/shopping-lists?limit=1`.
3. Un indicateur annonce « Vérification de la connexion » pendant cette demande, avec un délai HTTP de cinq secondes.
4. Si la lecture réussit, les écrans personnels deviennent accessibles.
5. En cas d’échec, un message et **Réessayer** remplacent le contenu de Liste.

Une inscription ou une connexion ne suffit donc pas si le serveur des listes est indisponible. La même protection s’applique aux accès depuis Accueil et Calendrier.

Le contrôle se fait à la prise de focus du navigateur. Il n’existe pas de vérification toutes les quinze secondes ni de synchronisation automatique au retour au premier plan. Les demandes effectuées ensuite peuvent elles-mêmes échouer et afficher leur erreur.

### Carte des écrans

```text
Listes
├── + circulaire en haut à droite → Liste d’articles ou Liste de produits
├── Listes récentes → cinq dernières listes → Voir tout si plus de cinq
└── Mes listes → listes sauvegardées → détail → Utiliser cette liste

Détail d’une liste d’articles
├── + Ajouter un article… → ingrédient ou texte libre sans prix
├── Case → achat / annulation
└── … → renommer, enregistrer dans Mes listes, terminer/rouvrir, fiches des éléments

Détail d’une liste de produits
├── + Ajouter un produit… → recherche → toucher un produit réel
├── Terminé → ferme les suggestions et rend Actualiser les prix disponible
├── Actualiser les prix → recalcule les produits choisis au jour courant
└── Fiche → quantités, produit alternatif, achats partiels et possession

Calendrier / Accueil avec semaine planifiée
└── Créer une liste de produits → scénario sélectionné → fiche dans Listes
```

Les cinq onglets sont conservés. La navigation native garde ses retours. Le détail affiche le nom réel de la liste ; son titre de navigation reste Ma liste. Une liste terminée doit être rouverte avant modification.

## 3. Page principale

Le titre est **Listes**. Un bouton **+ dans un cercle de 48 × 48**, en haut à droite du titre, ouvre le choix du type. Son nom accessible est Créer une liste. Le sélecteur reprend le style de Recettes : **Listes récentes** et **Mes listes**.

| Section | Contenu et actions |
| --- | --- |
| Listes récentes | Les cinq dernières copies de courses actives ou brouillons, par modification décroissante. Au-delà de cinq, **Voir tout** en bas à gauche ouvre Toutes les listes, avec pagination |
| Mes listes | **Il s’agit de vos listes sauvegardées.**, puis les tuiles nom/icône/type ; toucher ouvre la source réutilisable |

La section Historique est retirée. Les listes terminées/archivées sont exclues des récentes et de Toutes les listes. Les achats et ressources serveur restent conservés pour la compatibilité et la reprise des commandes ; les sauvegardes de Mes listes restent indépendantes. Les écrans distinguent chargement, erreur avec Réessayer et absence de contenu. Voir tout n’apparaît pas si le serveur annonce cinq listes ou moins.

Une ligne récente montre le nom, le compteur **à acheter** et, pour les produits, le nombre de **magasins**, chacun avec une icône. Le nombre total d’articles/produits reste retiré de cet aperçu. Les magasins sont dédupliqués par enseigne/succursale à partir des références choisies et achats conservés, sans compter les propositions périmées non retenues.

Les mots Articles/Produits et le statut En cours ne sont plus répétés visuellement dans les récentes. L’icône principale (liste ou chariot) et l’accent vert/bleu différencient les types. Le libellé accessible annonce les éléments restants, le statut, les magasins et le montant lorsqu’il existe. La même ligne est réutilisée sur Accueil. Chaque icône est rapprochée de sa valeur (4 points), tandis que les groupes À acheter et Magasins sont séparés par 22 points et peuvent revenir à la ligne.

Pour les produits, le montant se trouve **à droite**, sous **Total estimé** ou **Sous-total connu** quand des prix manquent. Le symbole **$** suit le montant (ex. **1,00 $**), sans icône monétaire supplémentaire ; la devise reste CAD dans le contrat et le libellé accessible la précise. Sans prix, Prix indisponible remplace le montant. Une liste d’articles n’affiche pas de prix. Un produit réellement gratuit conserve son zéro connu, distinct de l’absence de chiffrage.

Aucune date de courses ni mention En retard n’est affichée. L’utilisateur ne choisit pas un jour obligatoire pour faire les courses. Le champ serveur `purchase_date` subsiste comme date technique de calcul des prix et de compatibilité ; ce n’est plus une consigne dans l’interface.

## 4. Création et ajout selon le type

### Choisir le type

Le **+** propose deux options, chacune avec une courte explication :

- **Liste d’articles** : noter ses besoins et cocher ses achats, sans prix ni magasin.
- **Liste de produits** : choisir des références commerciales en magasin et suivre leur prix/total estimé.

Après sélection, la liste vide est réellement enregistrée puis ouverte. Les noms par défaut sont Mes courses et Mes produits. Aucun article, prix ou date saisi n’est obligatoire. Le nom reste modifiable dans le menu. En cas d’échec, Réessayer conserve le parcours ; une réponse incertaine se reprend avec la même clé idempotente.

Le type des nouvelles listes est **persisté et immuable** (`kind: articles|products`). Le backend refuse atomiquement un produit dans une liste d’articles ou un besoin sans produit explicite dans une liste de produits (`LIST_KIND_CONFLICT`). Les listes et sauvegardes anciennes restent en base, sans réécriture des achats ni des statuts. Une ancienne liste mixte est identifiée comme telle et n’accepte plus de nouveaux ajouts dans le mobile ; ses données restent consultables et ses achats modifiables.

### Ajouter des articles

La barre **+ Ajouter un article…** affiche les ingrédients correspondants ; aucun résultat commercial n’est proposé. Toucher un ingrédient l’ajoute sans choisir de produit, magasin ou prix. Sans sélection, **Entrée** ou **Terminé** ajoute le texte libre avec `ingredient_id: null`. Aucun ajout ne se déclenche sur une simple frappe ou perte de focus.

Champ vide : Récents puis Suggestions déterministes, sans statistiques inventées. Les récents sont privés par compte et affichent au maximum trois articles récents, sous forme de lignes comme les suggestions. Les produits ont leurs propres récents, limités à trois et conservant leur product_id, sans prix mis en cache. Les quantités se précisent ensuite dans la fiche. Aucun prix ni comparateur n’est proposé dans une nouvelle liste d’articles.

### Ajouter des produits et actualiser

La barre **+ Ajouter un produit…** affiche uniquement des produits commerciaux. Toucher une ligne choisit son identité stable et son magasin. Le nom, le format, la photo disponible, le prix applicable et ses conditions restent affichés. Aucune saisie libre ou suggestion générique ne peut être ajoutée dans cette liste. Si aucun produit n’est trouvé, il faut modifier sa recherche.

**Terminé** ou Entrée ferme les suggestions sans créer d’article libre. **Actualiser les prix** devient disponible après fermeture des ajouts, si la liste contient au moins un produit. Pendant la saisie, le bouton est désactivé avec une explication. L’action envoie `refresh_date: true` sur le recalcul existant : le serveur utilise le jour courant, conserve les références choisies et les instantanés des achats passés. Les prix non disponibles restent inconnus. La réponse n’est adoptée qu’après confirmation du serveur ; les erreurs et réponses incertaines conservent les mécanismes de reprise.

### Recherche et sauvegarde

Les demandes sont différées de 250 ms, bornées à trois résultats par page et annulées lorsqu’elles sont dépassées. Autres suggestions/produits remplace les trois lignes par la page suivante, sans allonger la liste ; Précédents permet de revenir. La cache locale des récents conserve jusqu’à huit entrées compatibles par compte, dont seulement trois du type courant sont affichées. Les réponses d’un ancien compte ou d’une ancienne liste sont ignorées. L’ajout produit envoie le `product_id` stable et l’ingrédient associé, jamais un prix calculé sur le téléphone.

Après un ajout par suggestion ou Entrée, le champ est vidé et le focus est rétabli. **Terminé** ferme les suggestions et retire le message « … ajouté à la liste ». S’il reste du texte libre à ajouter, la fermeture intervient seulement après confirmation du serveur, sans message résiduel ; un échec conserve la saisie. Les verrous empêchent le double ajout ; un doublon volontaire demande Regrouper ou Garder séparé selon les règles du besoin. Retour Android ferme sans enregistrer le texte. Le comportement du clavier reste à essayer sur appareils.

## 5. Création depuis le calendrier

### Conserver la période choisie

Depuis Calendrier → Épicerie, **Créer une liste de produits** enregistre le scénario sélectionné ; voir la section 17. Le formulaire historique de création d’articles reste utilisé depuis Accueil → **Créer la liste de la semaine**, avec les dates de la semaine réelle déjà renseignées. Les paragraphes ci-dessous décrivent ce formulaire.

Le nom par défaut est **Courses de la semaine**. Un aperçu des besoins est chargé automatiquement au jour courant ; Voir l’aperçu ou Actualiser l’aperçu permet une nouvelle lecture explicite. Aucun champ de date des courses n’est affiché. La sauvegarde crée une liste d’articles.

### Calcul des besoins

| Entrée | Traitement |
| --- | --- |
| Recette accessible du compte ou publique | Quantités ajustées aux portions du repas |
| Note libre | Ignorée avec compteur |
| Repas marqué comme restes | Ignoré avec compteur pour éviter de racheter ses ingrédients |
| Recette inaccessible | Exclue avec avertissement et confirmation requise |
| Aucun repas exploitable | Aperçu refusé explicitement |

Le calcul est `quantité de recette × portions du repas / portions de référence`. Les unités compatibles d’un même ingrédient sont additionnées. La provenance conserve recette, date, portions et version du contenu utilisé pour cet aperçu.

### Confirmer les besoins, sans imposer les prix

Les quantités de chaque ingrédient restent modifiables et chaque besoin peut être retiré. Une quantité incorrecte bloque l’écriture et conserve la correction. Une dimension vidée est retirée ; si toutes les dimensions sont vidées, l’article reste sans quantité.

Les notes et restes ignorés, exclusions personnelles et repas inaccessibles sont signalés. La création exige une confirmation pour les repas indisponibles et au moins un besoin retenu. **Créer plutôt une liste vide** permet de passer au parcours manuel si aucun besoin n’est exploitable.

**Créer la liste** envoie l’empreinte de l’aperçu, les corrections et retraits, sans `pricing`. La liste est active, de type articles et utilisable immédiatement, sans comparateur ni application de produits dans son détail. Les ajouts manuels supplémentaires se font ensuite par sa barre d’ajout.

Le serveur relit les sources dans la transaction et refuse un aperçu devenu ancien. Après création, les changements ultérieurs de calendrier ou de recettes ne réécrivent ni les besoins ni les achats de cette copie.

La vue Épicerie ne remplace plus la création par Ouvrir ma liste lorsqu’une copie existe déjà. Chaque création explicitement demandée est indépendante ; la reprise d’une commande incertaine conserve sa clé pour éviter un doublon.

## 6. Produits et prix

Les nouvelles listes d’articles n’ont aucun parcours d’application de produits. Pour suivre des références et des montants, créer une **Liste de produits**. La sélection se fait directement dans la recherche, puis **Actualiser les prix** réévalue les références après les ajouts.

La fiche d’un produit permet toujours de choisir une alternative pour le complément. Les achats passés restent conservés et ne sont pas facturés une seconde fois. Un produit explicitement sélectionné sans prix garde son identité ; Prix indisponible est affiché sans coût inventé.

Les routes historiques `creation-prices`, `price-options`, `comparisons`, `apply-comparison` et `recalculate-prices` sont conservées. L’écran historique Comparison existe pour compatibilité de navigation, mais aucun bouton Comparer les prix n’est proposé sur les nouvelles listes. Les nouvelles mutations typées refusent un résultat qui mélangerait articles et produits.

## 7. Logique des calculs

### Correspondances avec le catalogue

Un article choisi dans le catalogue possède un `ingredient_id`. Lors d’une comparaison ou d’un recalcul explicite, pour un nom libre, le serveur recherche un nom ou un alias exact après suppression des espaces de bord et comparaison sans distinction de casse. Il accepte cette association uniquement si elle correspond à un ingrédient unique.

Il ne fait pas de rapprochement approximatif et ne devine pas qu’un libellé inconnu désigne un produit. Un article libre peut rester dans la liste sans prix.

### Unités et portions

Les quantités sont normalisées en **g**, **ml** ou **unit**. Les conversions connues incluent 1 kg = 1 000 g, 1 L = 1 000 ml, 1 tasse = 250 ml, 1 cuillère à table = 15 ml et 1 cuillère à thé = 5 ml.

Les calculs de portions utilisent des fractions exactes. Une fraction à écriture décimale non finie est affichée par excès à six décimales, avec avertissement. Aucun passage masse–volume n’est inventé : 100 g et 100 ml d’un ingrédient ne sont pas additionnés comme une seule quantité.

### Nombre de produits et regroupement

Pour un format compatible :

```text
nombre de produits = plafond(quantité nécessaire / contenu d’un produit)
coût = prix applicable à ce nombre de produits
```

750 g dans des sacs de 500 g à 3 $ demandent deux sacs, soit 6 $. Un besoin de 1 000 g dans ces mêmes sacs demande aussi deux sacs.

Les besoins d’un même ingrédient sont regroupés **avant** cet arrondi. Deux lignes de 200 g et 300 g demandent ensemble un sac de 500 g, même si les lignes restent séparées dans la liste.

Sans quantité, une ligne demande une unité de vente. Deux lignes sans quantité demandent deux produits. Avec un besoin exprimé en unités et un produit dont le format n’est pas exprimé en pièces, le calcul direct utilise l’unité de vente.

Un format inconnu peut suffire à chiffrer un article sans quantité, mais ne permet pas d’inventer le contenu nécessaire pour couvrir des grammes ou des millilitres. Des dimensions incompatibles rendent le besoin non chiffrable par ce calcul.

### Date et promotion

Le calcul évalue les offres à la **date technique du calcul**, mise au jour courant lors de l’actualisation des prix, avec bornes de validité inclusives. Le prix promotionnel s’applique quand la promotion est confirmée active. Sinon, le prix régulier connu sert de référence ; sans prix applicable, le coût reste inconnu.

Exemple : quatre premières unités à 7,77 $, puis 10 $ chacune. Cinq unités coûtent `4 × 7,77 + 10 = 41,08 $`. Le prix après limite ne remplace pas un prix régulier absent hors de la période de promotion.

### Sens de Moins cher

Pour chaque groupe d’ingrédient, le serveur choisit le produit candidat qui minimise le **coût total à acheter**, arrondi aux produits entiers et avec les limites promotionnelles. Il ne compare pas seulement le prix affiché d’un paquet ou le prix au kilogramme.

À la création, un seul produit candidat est retenu par groupe ; le calcul ne mélange pas plusieurs formats pour résoudre un même besoin. Il ne calcule pas le coût des déplacements et ne promet pas le panier le moins cher parmi tous les produits existants : il compare les références disponibles et compatibles du catalogue.

Les choix explicites de l’utilisateur limitent le choix automatique. Un sous-total incomplet ne signifie pas que le panier couvre tous les besoins à ce montant. Les sources et leur niveau de vérification sont conservés ; un calcul réussi ne prouve ni le stock ni le prix de caisse.

## 8. Enregistrement de la liste

La création manuelle enregistre immédiatement une liste active vide. La création calendrier enregistre les besoins confirmés et leurs contributions. Aucune de ces opérations ne nécessite un panier ou une lecture de prix.

L’ajout générique sauvegarde immédiatement un besoin. L’ajout avec `product_id` vérifie la correspondance, conserve le choix explicite et chiffre uniquement les produits retenus : un produit invalide annule l’ajout complet. Un prix absent reste inconnu.

L’actualisation des prix est une écriture explicitement demandée. Le comparateur historique n’écrit qu’après Appliquer et confirmation. Son empreinte couvre les besoins, les achats et le catalogue. Une modification concurrente de liste, de calendrier ou de prix est refusée selon l’opération concernée, sans écriture partielle.

Chaque commande d’écriture possède une clé d’idempotence et, pour une ressource existante, la révision attendue. Une reprise de la même commande rend son résultat enregistré sans nouvelle liste, nouvel article ou nouvelle évaluation des prix.

## 9. Détail et organisation des courses

Le détail affiche le nom et la barre d’ajout. La phrase « Repas du… Copie indépendante du calendrier. » a été retirée ; les dates et la provenance restent conservées dans les données. Le statut est intégré au bloc résumé ; les phrases Liste en cours et Liste de produits · prix estimés ne sont plus répétées au-dessus. Aucune date complète de courses n’est affichée. Le bloc résumé regroupe le statut, puis des icônes et compteurs pour le total Articles/Produits, À acheter, Achetés, Disponibles si nécessaire et Magasins pour les produits. Les compteurs des listes d’articles sont centrés dans le bloc. La phrase Copie indépendante d’une liste sauvegardée est retirée de l’écran ; la provenance reste conservée sur le serveur.

Une liste générique ne présente aucun prix de ligne ni bloc total. Dès que des produits chiffrés ou des achats produits connus existent, le résumé indique Total estimé ou Sous-total connu. Le montant **Reste connu à acheter** est retiré ; le compteur du nombre d’éléments À acheter reste présent. Le total forme la troisième ligne du résumé sous les compteurs, centré avec son libellé et son montant suivi de $ ; il utilise les montants du serveur. **Prix au …**, les frais non documentés et les limites du prix en caisse sont déplacés tout en bas de la liste dans un bloc vert avec une icône d’information. Aucune note de prix n’apparaît sans panier ni achat de produit enregistré.

### À acheter

Les articles génériques sont des lignes compactes : case, nom et quantité facultative. Ils ne reçoivent aucune photo commerciale. Les produits retenus ajoutent leur référence, magasin, montant et photo si disponible. Un filtre d’enseigne existe lorsqu’il y a des produits ; Tous les magasins conserve aussi les besoins sans magasin.

Les groupes de magasin et de catégorie restent disponibles. Toucher le texte ouvre la fiche ; toucher la case agit sur l’achat. Un besoin partiellement couvert reste à acheter. Les listes de produits n’affichent plus en bas les blocs répétés Ingrédient · encore quantité ; les besoins quantifiés restent conservés pour le calcul du nombre d’emballages, des prix et de la couverture. Les anciennes listes mixtes conservent leur accès au détail des compléments.

### Achetés et possession

**Achetés (N) · Voir** ouvre la section repliée ; Masquer la replie. Les achats d’anciennes propositions gardent leurs quantités et prix sauvegardés. **Déjà disponible** présente les articles entièrement couverts par la possession.

Si les besoins ont changé, **Prix à recalculer** prévient que le panier ne chiffre plus le complément courant. Aucun recalcul n’est lancé automatiquement par un minuteur.

## 10. Fiche d’un article

La fiche s’ouvre dans un panneau défilant depuis le bas. Elle rappelle le besoin, sa couverture et la provenance des repas lorsque présente.

### Liste de produits

Toucher un produit ouvre sa fiche sans champ de renommage, sans Modifier le besoin,
sans Options avancées ni Actualiser les prix. **Définir la quantité** reste accessible. Les noms commerciaux sont protégés
également par le serveur (`PRODUCT_NAME_IMMUTABLE` sur un changement de nom d’une
liste typée products). Le bouton général Actualiser les prix reste sur la liste.
Le bouton Fermer la fiche est retiré ; toucher le fond ou utiliser Retour ferme
le panneau.

Cinq actions sont proposées :

| Action | Effet |
| --- | --- |
| Choisir dans un autre magasin | Affiche les références du même ingrédient dans les autres magasins, sans celle du magasin courant ; une sélection confirmée recalcule la liste et son total côté serveur |
| Définir la quantité | Saisie d’un entier positif représentant le nombre total d’emballages de vente ; recalcul immédiat côté serveur |
| J’en ai déjà | Confirmation annulable dans le panneau, puis retrait de ce produit de cette liste avec recalcul |
| Ne plus suggérer | Confirmation de la portée, puis préférence pour exclure son ingrédient des futures générations calendrier et retrait de la liste courante |
| Retirer de la liste | Retrait confirmé, restaurable depuis Produits retirés |

La quantité de produit accepte uniquement un entier de 1 à 1 000 000, sans
sélecteur g/ml. Une unité saisie représente un emballage vendu : 2 sacs de 500 g
ou 2 paquets de 3 pièces, et non 2 grammes ou 2 pièces. Le serveur traduit ce
nombre vers la quantité du format courant, conserve/déduit les achats existants
et recalcule sans montant calculé sur le téléphone.

Les actions J’en ai déjà, Ne plus suggérer et Retirer de la liste demandent un
retrait avec `refresh_prices: true`. Retrait et nouveau panier sont enregistrés
dans la même transaction et la même révision ; un échec de catalogue annule
le retrait et laisse la commande reprenable. Le bouton général Actualiser les
prix est conservé. Les avertissements dus à l’ancien panier périmé disparaissent
après recalcul ; les vrais prix inconnus restent signalés.

Les équivalents d’un autre magasin peuvent avoir un autre nom ou format ; aucun
SKU identique n’est supposé. Les prix indisponibles ne sont pas inventés. Un
échec de changement de magasin garde la sélection ouverte. J’en ai déjà n’efface
ni les achats conservés ni les autres listes. Ne plus suggérer utilise la
préférence d’ingrédient existante, commune aux magasins, et reste annulable dans
le menu du compte, dans Ingrédients non suggérés. La préférence est enregistrée avant le retrait ; si
ce second enregistrement échoue, il peut être repris. Les achats historiques
et les sauvegardes restent conservés.

### Liste d’articles et compatibilité historique

La fiche d’article affiche **Modifier le nom**, **Définir la quantité**,
**J’en ai déjà**, **Ne plus suggérer** et **Retirer de la liste**. Nom et quantité
ont chacun leur formulaire ; la quantité demande une valeur positive et une
unité. Les autres dimensions d’un ancien besoin sont conservées. J’en ai déjà
retire l’article après confirmation ; Ne plus suggérer enregistre la préférence
d’ingrédient puis retire l’article, comme pour un produit. Aucun recalcul de prix
n’est demandé pour une liste d’articles. L’exclusion est désactivée pour un texte
libre sans ingrédient associé.

Les anciennes listes mixtes conservent leur fiche et les fonctions historiques
de possession et d’achats partiels. Les routes backend correspondantes restent
accessibles. Les mutations sont bloquées sur une liste terminée ou archivée.

## 11. Achats, possession et quantités partielles

### Statuts de couverture

| Statut affiché | Signification |
| --- | --- |
| À acheter | Aucune couverture du besoin courant |
| Partiellement couvert | Possession et achats couvrent seulement une partie du besoin |
| Acheté | Le besoin est couvert par les achats, éventuellement complétés par la possession |
| Déjà disponible | La possession suffit à couvrir le besoin |

Un article sans quantité utilise une confirmation liée à son besoin courant. Modifier ce besoin ne permet pas de supposer que l’ancienne confirmation le couvre encore.

### Acheter un produit connu

La case d’un produit permet de déclarer tous les produits proposés achetés, ou de remettre l’achat à zéro. Une coche change immédiatement d’apparence avec « Enregistrement… », puis adopte le résultat du serveur. Un échec rétablit l’état confirmé et laisse son erreur/reprise visible. Dans la fiche, **Nombre de produits achetés** permet une saisie partielle, puis **Enregistrer la quantité achetée**.

La valeur est un nombre entier entre zéro et un million. Elle représente le total acheté pour cette ligne, pas un ajout à la déclaration précédente. L’interface sait aussi présenter les anciennes lignes issues du moteur de paquets ou de pas de vente.

Le serveur conserve le produit, son format, son prix sauvegardé, ses conditions, la quantité déclarée et son allocation aux articles du groupe. Un achat partiel ne confirme pas tous les articles d’un groupe : seuls ceux effectivement couverts le deviennent. Le surplus peut rester affecté au dernier article, sans disparaître du suivi.

### Acheter sans prix

Pour un article sans produit chiffré utilisable, la case peut confirmer le besoin restant. La fiche permet aussi de déclarer une quantité précise achetée sans prix.

Cette couverture réduit le besoin restant, mais aucun montant n’est inventé. Un article entièrement acheté peut donc encore empêcher une estimation complète du budget. L’application ne récupère pas le prix actuel du catalogue pour prétendre connaître le prix de cet achat.

### Possession

Dans la fiche historique des anciennes listes mixtes et dans l’API de possession, **J’en ai déjà** remplace la déclaration précédente de possession. Les nouvelles fiches d’articles et de produits utilisent désormais un retrait confirmé. Une déclaration de 200 g suivie d’une déclaration de 300 g signifie 300 g disponibles au total.

Le calcul de complément suit, pour chaque unité compatible : `maximum(0, besoin − possession − achats alloués)`. Cette déclaration ne modifie ni le calendrier ni les autres listes.

## 12. Actualisation et changement de produit

**Actualiser les prix** est réservé aux listes de produits, après fermeture des ajouts, dans le détail de la liste. Il est retiré de la fiche produit. Une copie de produits réutilisée affiche une seule note **Veuillez actualiser les prix.** tant qu’aucun panier frais n’est disponible. Les anciens avertissements COPY_PRODUCT_CHOICES par élément ne sont plus répétés en rouge ; la note disparaît après actualisation, tandis que les autres erreurs et avertissements restent visibles. Le jour courant remplace la date technique du calcul ; ce changement ne fixe pas un rendez-vous de courses. La commande conserve les produits choisis et les achats déjà enregistrés. Aucun minuteur ne recalcule les prix en arrière-plan.

Après modification d’une quantité, le panier peut devenir périmé : il faut actualiser pour revoir le complément. Les achats, leur couverture et leur prix sauvegardé restent conservés. Les alternatives permettent de changer un produit identifié ; un retour au choix automatique n’est pas proposé sur une nouvelle liste de produits, car chaque besoin doit conserver une sélection explicite.

Les anciens contrats de comparaison restent accessibles aux anciens clients. `kind: null` désigne leur compatibilité historique ; aucun statut ou achat n’est converti silencieusement. Voir les détails API dans la note de refonte.

## 13. Menu de la liste et modification des articles

### Menu …

Le bouton **…** en haut à droite ouvre un panneau d’options. Les actions sont désactivées pendant un chargement, une commande en cours ou une autre édition.

| Action | Conditions et parcours |
| --- | --- |
| Renommer la liste | Liste active ou brouillon → nom modifiable → Enregistrer le nom, ou Annuler |
| Épingler sur Accueil | Enregistre une préférence privée unique ; le libellé devient Ne plus épingler sur Accueil si cette liste est sélectionnée |
| Enregistrer dans mes listes | Ouvre le formulaire de liste sauvegardée ; possible aussi depuis une liste terminée ou archivée |
| Marquer comme terminée | Liste active ; confirmation si des articles restent à acheter |
| Rouvrir la liste | Remplace l’action de fin pour une liste terminée ou archivée |

L’épinglage existe encore dans le menu et dans l’API. **L’Accueil intégré le 19 novembre n’utilise toutefois plus le composant de liste épinglée** : il affiche plusieurs listes en cours. Cette préférence n’y détermine donc pas actuellement la liste mise en avant. Le texte Cette liste est épinglée sur ton accueil n’est plus affiché ; seul le libellé du bouton indique l’action disponible. Voir la section 17.

### Modifier et restaurer les éléments

Le bouton **Modifier** est retiré du menu de la liste. L’ajout reste directement dans la barre ; toucher un élément ouvre sa fiche pour modifier le besoin ou le retirer. Le formulaire avancé `ListItemsEditor` reste dans le dépôt pour compatibilité, mais n’est plus ouvert par ce menu.

Les éléments retirés sont restaurables depuis **Articles retirés (N)** ou **Produits retirés (N)**, une section repliée du parcours de courses. **Restaurer …** reprend l’élément par une commande révisionnée ; la limite de cinq cents éléments et le type de liste restent contrôlés.

Le menu ne propose plus de bouton **Fermer** : toucher le fond à l’extérieur ou utiliser le retour Android le referme. L’action de fond conserve un libellé accessible Fermer les options de la liste.

## 14. Fin des courses et listes terminées

### Terminer

Lorsqu’une liste active non vide n’a plus aucun élément à acheter, **Terminer la liste** apparaît directement au-dessus d’**Actualiser les prix** pour les produits, et au même emplacement pour les articles. Le bouton est désactivé pendant une commande ou un ajout encore ouvert. Il enregistre la fin des courses sans supprimer la liste ni ses achats. Après confirmation serveur, la copie quitte les récentes et l’écran revient à la section Listes récentes ; une erreur conserve l’état précédent et permet la reprise.

Depuis **… → Marquer comme terminée**, une copie sans élément restant est terminée directement. Sinon, une confirmation **dans l’écran** propose Continuer les courses ou Terminer quand même, en précisant le nombre d’éléments restants.

Terminer ne coche pas les éléments manquants et ne crée pas d’achats. Le statut devient `completed`, la copie quitte les récentes puis l’écran revient à cette section. Cette opération ne supprime jamais la source sauvegardée. Le stockage serveur des achats et des commandes reste conservé ; il ne s’agit pas d’un effacement SQL.

### Séparer copie et liste sauvegardée

**Utiliser cette liste**, depuis Mes listes, instancie une nouvelle copie active avec son propre identifiant et ouvre directement ce détail. La pile est remplacée par Listes récentes → copie, afin que Retour revienne aux listes récentes et non à la sauvegarde. Cette copie apparaît dans les récentes. Terminer cette copie la retire de ce parcours, tandis que la source reste disponible pour une prochaine utilisation.

Pour retirer la source de Mes listes, il faut ouvrir **ses propres paramètres → Supprimer la liste sauvegardée**, puis confirmer. Aucune action Terminer de la copie ne transmet de DELETE à cette source. Les anciennes routes de consultation/réouverture des listes terminées restent dans le backend pour compatibilité ; elles ne sont pas exposées dans les récentes.

## 15. Listes sauvegardées

### Enregistrer depuis une liste

**… → Enregistrer dans mes listes** ouvre le formulaire du même nom. L’utilisateur choisit uniquement le nom. Les choix d’icône Panier, Chariot, Feuille, Repas et Maison sont retirés ; le champ icon historique reste compatible côté serveur, sans choix demandé dans le mobile. Les besoins repris sont affichés avant l’enregistrement.

Seuls les éléments non retirés sont repris. **Mes listes contient uniquement des articles.** Une liste de produits est convertie en besoins génériques : nom et catégorie de l’ingrédient du référentiel lorsque disponible, quantités conservées, aucune référence commerciale, aucun magasin ni prix. Sans correspondance disponible, le nom existant est conservé. Achats et possession ne sont jamais copiés ; la liste de courses source reste intacte.

**Enregistrer dans mes listes** sauvegarde la ressource puis ouvre son détail. Une erreur conserve le formulaire ; une réponse incertaine propose une reprise sans doublon.

### Consulter et modifier

Dans la section **Mes listes**, toucher une tuile ouvre directement le détail. Son menu **…** contient **Modifier le nom**, **Supprimer la liste sauvegardée**, **Ajouter un article**, **Fermer**.

**Ajouter un article** ouvre directement la même barre de recherche que dans une liste d’articles : toucher un résultat l’enregistre immédiatement, sans formulaire de catalogue ou de quantité. Récents et suggestions sont limités à trois lignes chacun ; Entrée ou Terminé ajoute le texte libre si aucun résultat n’est sélectionné. Les quantités sont facultatives et se précisent ensuite. Les erreurs conservent la saisie et les commandes incertaines peuvent être reprises sans doublon.

Toucher un article existant ouvre son édition : nom, quantité facultative et unités de base g, ml, unité. **Retirer les quantités** permet de garder un besoin sans quantité. **Retirer cet article** demande confirmation. **Enregistrer l’article** enregistre la modification ; Annuler ferme le formulaire non sauvegardé.

Supprimer la liste sauvegardée ferme le menu et ouvre une confirmation dans l’écran, avec le nom de la sauvegarde, Annuler et Supprimer la liste sauvegardée. La confirmation ne dépend plus d’une alerte native présentée pendant la fermeture du menu. Elle prend aussi en charge les anciennes sauvegardes dont le type est absent ou nul. La commande DELETE conserve la révision et la clé idempotente, puis retourne à Mes listes après confirmation serveur. Les listes de courses et achats déjà créés restent conservés. Une liste sauvegardée vide affiche **Aucun article enregistré.**

### Utiliser une liste sauvegardée

**Utiliser cette liste** crée et ouvre une nouvelle liste active avec son nom, sans achats, possession ni prix historiques. Le nom reste modifiable. L’opération utilise la révision et une clé idempotente ; une réponse perdue propose Reprendre la création. La source sauvegardée reste inchangée. La copie créée est toujours une liste d’articles ; elle ne propose pas Actualiser les prix. Pour suivre des références commerciales, créer séparément une liste de produits.

Les termes internes `ShoppingTemplate`, les routes `/api/v1/shopping-list-templates`, les identifiants et données antérieures sont conservés. Les anciennes ressources appelées modèles apparaissent dans Mes listes sous forme d’articles. Les anciennes sauvegardes de produits sont converties dans les réponses de lecture, sans écriture en arrière-plan ni changement de révision. Leur prochaine modification persiste cette conversion. Même les anciennes commandes rejouées renvoient une sauvegarde d’articles ; les préférences commerciales ne sont pas réactivées. L’instanciation mobile envoie `activate: true` ; les anciens clients qui omettent `activate` gardent la création en brouillon.

## 16. Ingrédients non suggérés

Depuis la fiche d’un article identifié, **Ne plus suggérer** demande confirmation. La préférence exclut cet ingrédient des prochaines générations depuis le calendrier.

Depuis la fiche courante, la confirmation enregistre la préférence puis retire l’article ou le produit de cette liste. Les autres listes et les sauvegardes restent inchangées ; l’ingrédient reste ajoutable manuellement. La préférence et le retrait sont deux écritures distinctes : si le retrait échoue, il reste reprenable après l’enregistrement de la préférence. Les anciens parcours sans action de retrait conservent leur article.

Dans la fiche, la confirmation masque les autres actions et présente **Annuler** et **Confirmer** côte à côte. Elle explique le retrait courant et l’exclusion des prochaines générations.

L’écran **Ingrédients non suggérés** est accessible depuis le menu du compte sur Accueil. **Rétablir** annule une exclusion pour les prochaines générations, sans modifier les listes existantes. L’écran se recharge à chaque ouverture, sans bouton Actualiser permanent ; il propose Réessayer en cas d’erreur, la pagination et la reprise d’une préférence incertaine.

Un message du formulaire de calendrier renvoie encore à Paramètres pour rétablir ces ingrédients ; le menu du compte sur Accueil fournit également cet accès dans le code intégré.

## 17. Accès depuis Accueil et Calendrier

### Accueil actuel

L’Accueil affiche au maximum deux repas à venir du jour et masque les repas passés. À partir de 21 h, il présente ceux du lendemain. Un lien donne accès aux autres repas dans le Calendrier. Ces horaires utilisent l’heure de l’appareil au rendu de l’écran ; aucun minuteur dédié ne déclenche le changement. Les données sont rechargées au retour sur l’Accueil.

Mes listes en cours conserve sa sélection de trois copies actives récemment modifiées et ses accès Voir toutes et détail. Elle réutilise désormais le même résumé que Liste : éléments restants, magasins et budget total légendé à droite avec $ lorsqu’un chiffrage réel existe. Il n’y a plus de montant arrondi de reste présenté à la place du budget total.

Créer la liste de la semaine transmet réellement le lundi et le dimanche de la semaine courante, avec le mode calendrier. Créer une liste sans semaine planifiée utilise la création vide instantanée.

L’accueil charge encore la première page de collection current avant son filtrage local. Toucher une copie transmet à l’onglet Listes une pile explicite Listes récentes → ShoppingDetail avec son identifiant. Le contrôle d’accès conserve la pile déjà autorisée pendant la revérification, et bloque le contenu en cas de refus, sans perdre la destination au simple retour de focus. Les copies actives ne disparaissent plus en fonction d’une ancienne date de calcul ; seules les copies terminées ou archivées sont exclues. La préférence d’épinglage est conservée mais n’est pas utilisée par cet Accueil.

### Calendrier, vue Épicerie

La vue Épicerie utilise `EpicerieSemaine`. Elle calcule un aperçu des ingrédients de la semaine et demande les prix des quatre scénarios, sans créer de liste. La date d’évaluation est aujourd’hui si cette date appartient à la semaine affichée, sinon le lundi de cette semaine.

Le bouton **Créer une liste de produits** reprend le scénario sélectionné : Le
moins cher, Maxi, Metro ou Super C. Il crée directement une copie active nommée
**Épicerie 16-22 nov** (nom adapté aux changements de mois/année), puis ouvre sa
fiche dans Listes. Retour ramène aux listes récentes. Une liste déjà existante
n’est ni remplacée ni réutilisée.

Le rapprochement des prix des lignes utilise l’ingrédient ; les identifiants
UUID temporaires du devis ne sont pas ceux de l’aperçu calendrier. Les besoins
sans produit chiffrable pour le scénario choisi sont énumérés avant confirmation
**Créer avec les produits disponibles**, avec les repas inaccessibles éventuels.
Ils ne sont pas ajoutés comme articles libres. Sans produit chiffrable, la
création est désactivée et une actualisation ou un autre scénario est proposé.

Si des ingrédients sont écartés, le mobile demande le devis du sous-ensemble
et vérifie qu’il reprend les mêmes produits, prix et nombres d’emballages. Le
serveur vérifie ensuite les empreintes calendrier et prix dans la transaction,
conserve les besoins/provenances, enregistre les choix commerciaux de chaque
scénario et leur magasin, puis active la liste. Le devis est recalculé côté
serveur pendant la création ; son empreinte utilise les choix relus dans
l’ordre canonique des UUID après enregistrement. Un panier de plusieurs produits
est donc immédiatement utilisable dès l’ouverture, sans appui sur Actualiser
les prix ni faux avertissement de panier périmé. Un changement des sources refuse
la création et demande de revoir l’aperçu. Une erreur réseau se reprend avec la
commande persistée exacte, sans nouvelle copie ; les doubles appuis et réponses
d’un ancien compte ou d’une autre semaine sont ignorés. Aucune nouvelle
migration n’est requise. Les fiches et achats de Listes restent identiques.

## 18. Erreurs, concurrence et reprise

### Trois situations différentes

| Situation | Comportement attendu |
| --- | --- |
| Chargement en cours | Indicateur, actions concernées désactivées |
| Chargement réussi sans contenu | Message vide propre à la section |
| Échec de lecture ou d’écriture | Erreur explicite ; ne devient pas une liste vide réussie |

Les sections proposent Réessayer. Le détail recharge sa liste à l’ouverture et à la reprise de focus. Les listes et modèles se rechargent à la prise de focus de leurs écrans, sans minuteur périodique.

### Réponse d’écriture incertaine

Avant une écriture, le mobile conserve localement la commande dans l’espace du compte : chemin API, méthode, corps et clé d’idempotence. Si la réponse réseau est perdue, la commande reste marquée en attente.

L’écran peut afficher **Enregistrement à vérifier** et **Reprendre l’enregistrement**. Les nouvelles modifications sont bloquées tant que cette demande reste incertaine. La reprise renvoie exactement la même commande ; le serveur rend le résultat déjà enregistré au lieu de créer une seconde liste ou de recalculer à nouveau ses prix.

Cette reprise peut être retrouvée après fermeture de l’application. Elle n’est pas une file de synchronisation hors connexion : aucun envoi automatique en arrière-plan n’est prévu, et la liste complète n’est pas mise en cache pour un usage hors ligne.

### Conflits et refus explicites

Chaque écriture modifiant une ressource existante transmet sa révision attendue. Si un autre appareil a modifié la liste, le serveur refuse l’ancien état avec un conflit. Le compteur de révision protège les écritures ; il ne représente pas un historique consultable.

Les refus explicites 404, 409 ou 422 retirent la commande de reprise dans le mobile. La suite consiste à relire la ressource, corriger les champs ou refaire le devis selon le message. Les erreurs réseau et 503 restent incertaines et conservent la commande.

| Exemple | Suite logique |
| --- | --- |
| Calendrier modifié après l’aperçu | Régénérer et vérifier l’aperçu |
| Prix ou ingrédients modifiés après le devis | Recalculer les prix avant de créer |
| Liste modifiée par un autre appareil | Rouvrir ou actualiser la liste avant une nouvelle action |
| Panier périmé avant un nouvel achat produit | Recalculer les prix ; les achats déjà enregistrés restent conservés |
| Produit alternatif incompatible | Choisir une autre option ou conserver un besoin sans prix |
| Impossible de lire la commande locale | Rouvrir l’écran ; aucune confirmation de sauvegarde n’est inventée |

Les réponses tardives d’un autre écran ou d’un ancien compte sont ignorées. Le serveur déduit le propriétaire du jeton authentifié et contrôle les droits, même si un identifiant de liste est fourni directement.

## 19. Présentation et accessibilité

### Style commun

Liste réutilise les composants des recettes : écran défilant, titres DM Sans, champs, boutons et cartes. Les couleurs principales sont le fond clair `#fafbf8`, le vert `#216b48`, le texte foncé `#192d23`, les bordures `#e1e8df` et une couleur d’avertissement `#9f2d20`.

Le bouton de création est l’action principale. Les actions secondaires utilisent généralement la variante neutre. Les informations de catégorie, provenance et format restent secondaires par rapport au nom et aux quantités. Les lignes génériques restent sans photo ni prix. Un produit commercial explicitement retenu peut afficher sa photo et son montant ; les lignes restent plus compactes que les cartes Promos.

Les panneaux d’options, de date, d’unité et de fiche article s’ouvrent sur un fond assombri. Les panneaux longs sont défilants et tiennent compte des zones sûres du téléphone.

### Champs de date des composants historiques

Les nouveaux parcours mobiles n’imposent aucun champ de date de courses. Les composants conservés pour les anciens parcours savent encore ouvrir un sélecteur : toucher une date ouvre une liste des jours du mois. **Mois précédent**, **Mois suivant**, **Aujourd’hui** et **Fermer** permettent de naviguer. Le jour sélectionné porte une coche ; choisir un jour ferme le panneau.

### Retours d’action et protections

Les rôles de bouton, case à cocher, choix radio et en-tête sont renseignés dans les composants concernés. Les états sélectionné, déplié, coché et désactivé sont exposés aux lecteurs d’écran. Les erreurs utilisent un rôle d’alerte dans les zones prévues.

Les cases et menus importants disposent de zones tactiles d’au moins 48 × 48. Les icônes décoratives sont exclues de la lecture. Le résumé de liste annonce une phrase complète avec statut, reste à acheter et coût en dollars canadiens ; aucune date de courses n’est annoncée. Ses indicateurs peuvent revenir à la ligne lorsque le texte grandit.

Ces éléments décrivent les dispositions présentes dans le code ; la navigation au lecteur d’écran, le clavier, le retour Android et les grandes tailles de texte doivent encore être vérifiés sur les appareils ciblés.

## 20. Architecture, API et fichiers utiles

### Répartition des responsabilités

Le mobile prépare les formulaires, présente les résultats et envoie les actions explicites. FastAPI valide les données et les droits. Les services backend calculent les besoins, produits, prix, couvertures et totaux. PostgreSQL conserve les ressources privées.

Le stockage distingue notamment listes, articles, quantités requises et possédées, contributions des recettes, achats manuels, achats de produits, paniers enregistrés, préférences produits, modèles, exclusions, épinglage et commandes rejouables.

La table technique des révisions conserve l’état courant lors des mutations ; les résultats de commandes sont conservés pour le rejeu. Aucun écran ne propose de consulter les anciennes versions d’une liste.

### Appels utilisés par les parcours

Les chemins ci-dessous sont sous `/api/v1`. Les écritures passent une clé `Idempotency-Key` ; les modifications de ressources utilisent leur révision selon le contrat.

| Opération | Méthode et route |
| --- | --- |
| Consulter les listes | `GET /shopping-lists` |
| Lire un détail | `GET /shopping-lists/{id}` |
| Préparer les prix sans créer | `POST /shopping-lists/creation-prices` |
| Préparer les besoins du calendrier | `POST /shopping-lists/calendar-preview` |
| Créer manuellement | `POST /shopping-lists` |
| Créer depuis le calendrier | `POST /shopping-lists/from-calendar` |
| Renommer | `PATCH /shopping-lists/{id}` |
| Ajouter un article | `POST /shopping-lists/{id}/items` |
| Modifier, retirer ou restaurer un article | `PATCH /shopping-lists/{id}/items/{item_id}` |
| Déclarer la possession | `PUT /shopping-lists/{id}/items/{item_id}/possession` |
| Déclarer un achat sans prix | `PUT /shopping-lists/{id}/items/{item_id}/manual-purchase` |
| Déclarer le nombre de produits achetés | `PUT /shopping-lists/{id}/product-purchases` |
| Choisir un produit existant | `PUT /shopping-lists/{id}/items/{item_id}/selected-product` |
| Consulter les alternatives | `GET /shopping-lists/{id}/price-options` |
| Recalculer ou appliquer un aperçu explicite | `POST /shopping-lists/{id}/recalculate-prices` |
| Activer un ancien brouillon | `POST /shopping-lists/{id}/activate` |
| Terminer ou rouvrir | `POST /shopping-lists/{id}/complete`, `POST /shopping-lists/{id}/reopen` |
| Consulter, créer et modifier les modèles | `GET/POST /shopping-list-templates`, `GET/PATCH/DELETE /shopping-list-templates/{id}` |
| Consulter et modifier les exclusions | `GET /shopping-list-exclusions`, `PUT /shopping-list-exclusions/{ingredient_id}` |
| Lire ou modifier l’épinglage | `GET/PUT /shopping-list-pin` |

La route `instantiate` est utilisée par les modèles. Les routes `archive`, `duplicate`, `comparisons` et `apply-comparison` restent disponibles pour compatibilité. `GET /offers` accepte désormais `q` avec pagination et date, comme `GET /ingredients` pour les noms/alias. Les nouveaux champs des contrats sont décrits dans [la note de refonte](SHOPPING_REFACTOR.md).

### Points d’entrée dans le code

| Fichier | Responsabilité |
| --- | --- |
| [mobile/App.tsx](../../mobile/App.tsx) | Écrans et protection du navigateur Liste |
| [ListScreen.tsx](../../mobile/app/ListScreen.tsx) | Listes récentes et listes sauvegardées |
| [CreateListScreen.tsx](../../mobile/app/CreateListScreen.tsx) | Création vide instantanée ou confirmation des besoins du calendrier |
| [ShoppingComparisonScreen.tsx](../../mobile/app/ShoppingComparisonScreen.tsx) | Comparaison facultative, détails et application confirmée |
| [ListQuickAdd.tsx](../../mobile/components/lists/ListQuickAdd.tsx) | Recherche paginée, ajout générique ou sélection produit |
| [shoppingPresentation.ts](../../mobile/services/shoppingPresentation.ts) | Montants et dates communs entre Accueil et Liste |
| [ShoppingListDetailScreen.tsx](../../mobile/app/ShoppingListDetailScreen.tsx) | Détail, menu, renommage et fin des courses |
| [ListCourses.tsx](../../mobile/components/lists/ListCourses.tsx) | Magasins, catégories, achats et articles libres |
| [ListArticleSheet.tsx](../../mobile/components/lists/ListArticleSheet.tsx) | Besoin, possession, achat manuel et alternatives |
| [ProductPurchase.tsx](../../mobile/components/lists/ProductPurchase.tsx) | Produits achetés, cases et achats partiels |
| [ListItemsEditor.tsx](../../mobile/components/lists/ListItemsEditor.tsx) | Ajout, retrait et restauration |
| [ShoppingTemplateDetailScreen.tsx](../../mobile/app/ShoppingTemplateDetailScreen.tsx) | Édition des modèles |
| [ShoppingReuseScreen.tsx](../../mobile/app/ShoppingReuseScreen.tsx) | Création d’un modèle depuis une liste |
| [useListCommand.ts](../../mobile/components/lists/useListCommand.ts) | Commandes incertaines et reprise manuelle |
| [shoppingLists.ts](../../mobile/services/shoppingLists.ts) | Client HTTP des listes |
| [calendar.py](../../backend/app/shopping_lists/calendar.py) | Agrégation des repas, portions et empreinte d’aperçu |
| [draft_pricing.py](../../backend/app/shopping_lists/draft_pricing.py) | Devis directs, formats, arrondi et création du panier |
| [recalculation.py](../../backend/app/shopping_lists/recalculation.py) | Prix du complément et changements de produits |
| [courses.py](../../backend/app/shopping_lists/courses.py) | Achats produits, allocations, totaux et clôture |
| [service.py](../../backend/app/shopping_lists/service.py) | Persistance, autorisations, révisions et idempotence |
| [reuse.py](../../backend/app/shopping_lists/reuse.py) | Modèles, copies et exclusions |

La séparation des types demande la migration `0023_shopping_list_kind` avant lancement du backend ; son application sur la base configurée a été confirmée le 20 novembre 2026 (`alembic current` : `0023_shopping_list_kind (head)` ; `alembic check` : aucune opération supplémentaire). Les guides [de création](SHOPPING_CREATION.md), [du recalcul](SHOPPING_COMPARISONS.md) et [des contrats](SHOPPING_LISTS_CONTRACTS.md) apportent les détails techniques. Certaines de leurs sections anciennes décrivent les étapes historiques du développement ; ce document présente les parcours relevés dans le code à la date indiquée.

## 21. Parcours de vérification

**État validé manuellement le 19 novembre 2026.** Hamza confirme : « J’ai fait les tests, onglet Listes, tout ce qui concerne les listes est fonctionnel. » Cette confirmation porte sur l’état courant après les derniers ajustements, notamment le panier à jour dès la création depuis Calendrier et le retrait des blocs d’ingrédients répétés. Elle est consignée comme une validation fonctionnelle globale déclarée par l’utilisateur ; aucun relevé détaillé par scénario ni plateforme iOS/Android/web n’a été fourni.

Vérification automatisée de la refonte du 19 novembre, avant les changements mobiles du 20 novembre : **1 039 tests backend réussis, 14 ignorés**, **302 tests mobiles réussis**, TypeScript, 47 exports de contrats cohérents et exports Expo iOS/Android/web valides. Ces résultats sont ceux de la correction précédente ; aucun test n’a été relancé pour cet ajout documentaire.

Le 20 novembre, après les ajustements de Recettes et des photos Web, la suite mobile complète passe à **314 tests réussis**, avec TypeScript et lint sans erreur (111 avertissements existants). Ces résultats précèdent Petit budget : sa livraison du 20 novembre a ensuite
validé la suite complète avec 1 055 tests backend réussis, 14 OCR optionnels
ignorés et 315 tests mobiles réussis. Voir les
[validations courantes](../../README-fonctionnement.md#validations-connues).

La [note de refonte](SHOPPING_REFACTOR.md) consigne les lots, les tests réellement exécutés et le statut des critères AC-01 à AC-24. Les tests utilisateurs et les essais natifs ne sont pas remplacés par les tests automatisés.

Pour les prochaines vérifications de régression : créer séparément une liste d’articles et une liste de produits ; retrouver la liste après relance ; ajouter et cocher/décocher ; changer de produit ou actualiser ses prix après un achat ; créer depuis Calendrier avec chacun des quatre scénarios et confirmer les exclusions ; sauvegarder puis réutiliser une liste en articles ; interrompre une réponse et reprendre ; changer de compte pendant une recherche. La comparaison avancée des anciennes listes reste un parcours de compatibilité, pas un bouton des nouvelles listes d’articles.

La validation globale ci-dessus ne précise pas les essais iOS/Android avec clavier, texte agrandi et lecteur d’écran. Les objectifs de création/ajout en moins d’une minute sont des mesures à réaliser avec des utilisateurs, pas des résultats acquis.

*Dernière mise à jour documentaire : 23 novembre 2026 ; validation fonctionnelle globale des listes du 19 novembre, ajustements récents à vérifier sur appareils.*

# Onglet Liste — ajustements du 16 novembre 2026

Ces choix demandés après les essais remplacent les anciennes propositions de
présentation visiteur, d’entrée hors connexion et de récupération locale.

## Présentation

L’onglet utilise le titre et les composants des autres onglets, sans marque
OptiMeal, illustration de panier ou paragraphe d’introduction. Son ordre est :

1. **+ Créer une liste** : bouton principal.
2. **En cours** : listes privées en préparation ou actives ; message explicite
   lorsqu’il n’y en a pas, puis pagination si nécessaire.
3. **Historique** : au maximum trois listes terminées ou archivées. **Voir tout**
   ouvre une page séparée avec pagination pour l’historique complet. Une section
   vide indique qu’aucune liste n’est enregistrée dans l’historique.
4. **Mes modèles** : tuiles avec icône et nom, ouvrant directement le modèle.
   Cette section reste en dernier et propose la suite des modèles si nécessaire.

Le « + » reste uniquement sur le bouton **+ Créer une liste** de l’onglet Liste.
Les deux pages de création gardent le titre **Créer une liste**, sans « + ».
Les sections En cours, Historique et Mes modèles sont séparées par une ligne
fine de la palette existante et un espacement régulier ; titres et cartes
conservent les composants de l’application. L’ordre des sections est conservé.

Les lignes de **En cours** et **Historique** (aperçu et page complète) affichent
le nom puis quatre indicateurs avec icônes : nombre d’articles, nombre de magasins,
date des courses au format JJ/MM/AAAA et coût total estimé. Le montant est celui
du budget complet, pas le reste à acheter. Un sous-total porte « ≥ » ; un coût
inconnu affiche « — ». Les magasins du panier courant et des achats conservés
sont dédupliqués par enseigne/succursale ; un panier périmé ne compte que les
magasins des achats conservés. Le lecteur d’écran annonce les libellés complets.
La ligne se replie si nécessaire avec un texte agrandi.

Le détail garde ses besoins, achats, estimations et options. Les modèles se
créent depuis les options d’une liste et restent accessibles directement.

Le résumé compact est aussi utilisé dans **Ton épicerie** sur Accueil,
avec les mêmes icônes, valeurs et règles de coût.

## Actions du détail

Le détail d’une liste regroupe ses actions dans **…** en haut à droite :
**Renommer la liste**, **Épingler sur Accueil** (ou retirer l’épinglage),
**Utiliser comme modèle**, **Marquer comme terminée** et **Modifier**.
L’ancien bouton Options et les actions de fin de courses en bas sont retirés.
Modifier ouvre l’ajout d’articles libres ou du catalogue, avec quantité facultative,
et la suppression confirmée. Un article retiré peut être restauré depuis ce mode.
Les ajouts/suppressions sont enregistrés directement et les achats existants
restent conservés ; les prix périmés continuent d’être signalés pour réévaluation.
Un ingrédient déjà présent demande addition ou ligne séparée. Une erreur garde
la saisie ; une réponse incertaine se reprend explicitement.
Une liste terminée/archivée propose **Rouvrir la liste** avant de permettre
renommage, épinglage ou modification ; elle reste utilisable comme modèle.
La clôture demande confirmation si des articles restent à acheter. Les anciens
brouillons doivent être activés avant d’être marqués terminés.

## Produits sauvegardés et recalcul

Les produits et leurs prix apparaissent directement dans le détail, avec les
achats enregistrés visibles par défaut. Une seule action **Recalculer les prix**
remplace les deux boutons de comparaison. Elle utilise les prix directs et les
produits entiers arrondis au supérieur pour le complément, en déduisant ce qui
est déjà acheté ou disponible. Les achats passés gardent leurs prix et quantités.
Le changement de magasin d’un produit suit aussi ce parcours. Voir le
[fonctionnement du recalcul](SHOPPING_COMPARISONS.md).

## Modèles pour les occasions

Un modèle est une liste enregistrée pour une occasion (fête, barbecue, voyage,
sortie), retrouvée par son icône et son nom. Son détail propose **…** en haut à
droite : **Modifier le nom**, **Supprimer le modèle**, **Ajouter un produit**.
Les produits s’enregistrent directement dans le modèle. Le formulaire de nouvelle
liste (nom, date et création depuis le modèle) et les actions globales en bas
sont retirés. Toucher un produit permet encore de le modifier.

## Compte et réseau requis

`ListAccessRequired` protège l’ensemble du navigateur Liste, y compris les liens
vers un détail depuis Accueil et Calendrier. Un visiteur voit uniquement la
demande de connexion. Pour un compte connecté, une lecture privée légère doit
réussir avant le montage des écrans. Une absence de réseau, un service
indisponible ou une session refusée bloque l’accès avec une reprise explicite.

Le contrôle s’exécute à l’entrée, avec un délai HTTP de cinq secondes. Il ne se
répète ni toutes les quelques secondes ni au retour au premier plan. Une action
en erreur est signalée et peut être retentée explicitement. Le cache des listes
et la file de synchronisation sont retirés. Voir la [création complète](SHOPPING_CREATION.md).

## Suppression du parcours de récupération

Le service, l’écran, la route, le guide et les tests dédiés à l’import des anciennes
données locales sont retirés. Aucun import, aperçu, journal de récupération ou
proposition de conversion d’un ancien garde-manger n’est exécuté. Les anciennes
clés de téléphone ne sont pas effacées par ce retrait et restent inutilisées.
Les modèles et exclusions créés explicitement dans le parcours actuel restent
indépendants de cette ancienne fonctionnalité.

## Création et versions

La création a deux pages : **Ingrédients**, puis **Prix par magasin** via **Suivant**.
La première permet aussi d’ajuster les quantités issues du calendrier. La seconde
présente Maxi, Metro, Super C et Moins cher, les produits exacts au toucher, et
les alternatives par produit. Moins cher regroupe les achats par magasin.
Le coût utilise le prix direct et le nombre de produits arrondi au supérieur.
Seule **Créer la liste**, après sélection du panier, enregistre la liste active
et les prix. [Le guide de création](SHOPPING_CREATION.md) détaille le calcul et
la validation serveur. Les versions restent retirées et l’historique des listes
terminées reste disponible.

## Validation

TypeScript et les tests mobiles couvrent les sections, la création complète,
l’historique à trois lignes, les modèles, le compte requis et la vérification
réseau à l’entrée sans minuteur. Les essais iOS/Android restent à consigner.


Validation du 16 novembre 2026 : **959 tests backend réussis**, 14 essais OCR
opt-in ignorés ; **225 tests mobiles réussis**, TypeScript, 44 exports de contrats,
bundles Expo iOS/Android et documentation stricte vérifiés. Tests PostgreSQL
exécutés uniquement sur une base locale jetable. Lint mobile non configuré.
Les essais sur téléphones restent à consigner.

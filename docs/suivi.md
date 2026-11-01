---
title: Suivi du projet
---

<style>
    @media screen and (min-width: 76em) {
        .md-sidebar--primary {
            display: none !important;
        }
    }

    /* Afficher seulement les semaines dans la table des matières. */
    .md-nav--secondary > .md-nav__list > .md-nav__item > .md-nav {
        display: none;
    }
</style>

# Suivi de projet

Cette page sera mise à jour chaque semaine avec les avancées, les difficultés, les choix effectués et les prochaines étapes, en lien avec les rencontres de supervision.

## Semaine 1 (31 août – 6 septembre)

### Objectifs de la période

- Présenter au professeur la description du projet et son cadrage
- Présenter les cas d’utilisation visés
- Discuter des technologies à utiliser pour développer l’application

### Travail réalisé

- Rédaction de la description du projet et identification des utilisateurs cibles
- Présentation des cas d’utilisation visés : sauvegarde de recettes, intégration de l’IA pour générer des recettes et aider à la planification, ainsi que planification des repas dans un calendrier
- Définition initiale de l’intégration des promotions hebdomadaires afin de recommander des recettes en fonction des rabais

### Décisions et ajustements

- Technologies retenues et confirmées avec le professeur : React Native avec TypeScript et Expo pour le mobile, Python avec FastAPI pour le backend et PostgreSQL pour la persistance
- Comparer différents modèles LLM afin de choisir la solution la plus adaptée aux besoins du projet
- Considérer un aspect communautaire, par exemple des profils utilisateurs et le partage de recettes
- Déterminer avec le coéquipier la priorité entre l’aspect recettes et l’aspect budget, promotions et liste d’épicerie

### Difficultés rencontrées

- Identifier des sources de données fiables pour les produits, les prix et les promotions
- Déterminer quel aspect de l’application doit être priorisé

---

## Semaine 2 (7–13 septembre)

### Objectifs de la période

- Rechercher des applications semblables
- Commencer le prototype de l’application

### Travail réalisé

- Analyse de deux applications similaires : AnyList et Flipp
- Création d’une première version de la maquette dans Figma
- Découverte de l’API epiceries.ca comme source potentielle de produits et de prix, qui reste à évaluer

### Décisions et ajustements

- Tester l’API epiceries.ca et évaluer la qualité de ses résultats
- Tester l’extraction des données à partir des circulaires et l’extraction web à partir des sites des magasins
- Limiter les premiers essais aux magasins Metro, Maxi et Super C afin de simplifier le démarrage

---

## Semaine 3 (14–20 septembre)

### Objectifs de la période

- Présenter au professeur une analyse des solutions existantes
- Présenter un premier prototype et l'architecture générale
- Recueillir des commentaires pour orienter le projet

### Travail réalisé

- Analyse d'applications semblables (Reebee, Mealime)
    - Ce qu'OptiMeal apporte de plus : croiser les recettes planifiées avec les rabais des épiceries
- Présentation du prototype de l'application
    - Modèle C4, niveaux 1 (contexte) et 2 (conteneurs) et niveaux 3 (composants)
- Montre la circulation des données entre l'application, le serveur et les sources externes


### Décisions et ajustements

- **Recettes** : étapes illustrées de photos pour les personnes qui
      savent peu cuisiner ; un seul mode manuel combinant la saisie et
      l'import de texte (modes 1 et 4) ; avis des utilisateurs sur la
      difficulté d'une recette
- **Prix et données** : contribution des utilisateurs par photo de reçu ;
      script qui récupère automatiquement les circulaires ; couche d'IA pour
      filtrer les résultats d'epiceries.ca ; plan de secours pour les données
- **Magasins** : lancement limité à Metro, Maxi et Super C ; les petits magasins pourront être ajoutés progressivement à la carte avec géolocalisation. Lorsque les données de prix ne sont pas accessibles, les reçus confirmés par les utilisateurs constitueront une source importante pour compléter les données
- **Utilisateurs** : profils types (étudiants, familles, passionnés de
      cuisine) ; aspect communautaire avec profils à côté des recettes ;
      historique des listes d'achats

### Difficultés rencontrées

- Recherche imprécise dans l'API d'epiceries.ca
    - Une recherche retourne tous les produits qui contiennent le mot
          cherché (ex. « lait » retourne aussi le chocolat au lait)
    - Solution envisagée : une couche d'IA pour filtrer les résultats
- Accès aux données de prix
    - Flipp et Reebee obtiennent leurs données par entente directe avec
          les détaillants, et les outils tiers qui les récupèrent sont payants
    - Nous devons combiner plusieurs sources et prévoir un plan de secours

---

## Semaine 4 (21–27 septembre)

### Objectifs de la période

- Évaluer les sources de données de prix possibles
- Tester l'extraction automatique des circulaires et des reçus

### Travail réalisé

- Essai de l'API d'epiceries.ca comme source de prix
- Extraction web avec un LLM
    - Génération d'une liste des produits les plus utilisés,
        pour couvrir le plus grand nombre de recettes
    - Essai de récupération de leurs prix sur le web avec ChatGPT
- Extraction des circulaires
    - Script Python qui cherche les circulaires PDF sur les sites des
      magasins, les télécharge et en extrait les produits et les prix
      avec l'API Gemini (utilisée pour les tests)
- Extraction des reçus
    - La même méthode a été testée sur des photos de reçus

### Décisions et ajustements

- Pour le lancement, limitation à trois magasins (Maxi, Metro, Super C) afin de faciliter le travail ; d’autres magasins pourront être ajoutés progressivement. Les reçus confirmés par les utilisateurs aideront à compléter les données de prix lorsque l’accès aux données des petits magasins est limité
- Les circulaires PDF ne seront pas la source principale, à cause des
    problèmes d'exactitude et de disponibilité
- Méthode retenue pour récupérer les données : extraction web avec ChatGPT ; les reçus confirmés par les utilisateurs compléteront les données manquantes
- Les promotions récupérées et stockées dans la base de données devront être exactes à au moins 99 %
- Plan B : OpenCV et pytesseract pour extraire le texte des photos
    au lieu de Gemini

### Difficultés rencontrées

- **epiceries.ca** : résultats incomplets (parfois un seul ingrédient
      d'un seul magasin) et filtre peu fiable
- **Circulaires PDF** :
        - plusieurs produits souvent regroupés sous un même prix
        - lien de téléchargement du PDF pas toujours disponible
        - extraction pas exacte à 100 %
- **Extraction avec ChatGPT** : données correctes, mais traitement très
      lent (environ 8 minutes pour 5 produits dans 3 magasins)

---

## Semaine 5 (28 septembre – 4 octobre)

### Objectifs de la période

- Poursuivre les essais de collecte de prix
- Tester OpenCV et Tesseract pour les photos de reçus
- Préparer la structure de la base de données

### Travail réalisé

- Collecte et vérification des produits, des prix et des promotions Maxi avec Apify
- Regroupement des données Maxi dans le même format que l’échantillon Super C
- Ajout de la consultation du catalogue dans le serveur
- Essais de lecture des reçus avec Apple Vision et Tesseract + OpenCV ; vérification des prix sur quatre reçus Maxi et Metro
- Préparation du modèle de base de données ; PostgreSQL reste à mettre en place

### Décisions et ajustements

- Utiliser Apify pour les données Maxi
- Poursuivre l’extraction web avec un modèle IA pour Metro et Super C
- Ne plus utiliser épiceries.ca ni poursuivre l’extraction des circulaires PDF comme source de données
- Conserver Apple Vision pour Mac et Tesseract + OpenCV comme solution pour Windows, à tester sur PC

### Difficultés rencontrées

- Certaines recherches Apify retournent des produits proches de ceux demandés ; une vérification reste nécessaire
- Un rabais du reçu Metro est encore mal lu par Apple Vision
- La lecture des reçus sur Windows et pour Super C reste à vérifier ; les essais actuels ont été réalisés sur Mac

### Prochaines étapes

- Développer et évaluer la collecte web pour Metro et Super C
- Reproduire les essais de reçus sur Windows et ajouter un reçu Super C
- Mettre en place PostgreSQL et commencer la connexion entre le mobile et le serveur

---

## Semaine 6 (5 octobre - 11 octobre )

### Objectifs de la période

- Explorer une autre méthode de récupération des données Maxi
- Compléter les échantillons de produits des trois enseignes

### Travail réalisé

- Essai de récupération directe des données Maxi via PC Express sur cinq produits retrouvés à partir des codes d’un reçu
- Récupération réussie des noms, formats et prix des cinq produits ; les codes et les prix correspondent à l’échantillon du reçu
- Ajout d’un échantillon de 31 produits Metro au format JSON, comme pour Super C

### Décisions et ajustements

- Demander l’avis du professeur avant de poursuivre la piste PC Express, notamment sur les conditions d’utilisation des données
- Conserver Apify comme source Maxi retenue en attendant cet avis

### Difficultés rencontrées

- La recherche automatisée des produits sur le site Maxi est bloquée ; les liens ont été retrouvés manuellement pour l’essai
- Le fonctionnement de la récupération directe dans la durée reste à évaluer

### Prochaines étapes

- Recueillir l’avis du professeur sur la piste PC Express
- Valider les échantillons Metro et Super C et poursuivre l’étude de leur collecte
- Mettre en place PostgreSQL et commencer la connexion entre le mobile et le serveur


---

## Semaine 7 (12 octobre - 18 octobre)

### Objectifs de la période

- Mettre en place PostgreSQL et la connexion entre le serveur et la base
- Développer la page Recettes : serveur et application mobile
- Permettre aux utilisateurs de créer un compte et de gérer leurs propres recettes

### Travail réalisé

- **Base de données**
    - Mise en place de PostgreSQL sur Supabase
    - Gestion du schéma avec Alembic : chaque modification de la base est une migration versionnée dans Git
    - Première table `ingredient` (31 ingrédients) et import rejouable sans doublons
- **Serveur**
    - Tables des recettes (`recipe`, `recipe_ingredient`, favoris, difficulté et étiquettes)
    - Routes `/api/v1/recipes` : liste avec recherche, détail, création, modification, suppression et favoris
    - Import des recettes initiales
    - Comptes utilisateurs avec Supabase Auth et profil
    - Photos des recettes dans Supabase Storage
- **Application mobile**
    - Liste des recettes avec recherche et filtres (Toutes, Favoris, Rapides)
    - Détail d'une recette : ingrédients, étapes, temps et portions
    - Ajout et modification d'une recette en saisie manuelle
    - Connexion, création de compte et page de profil

### Décisions et ajustements

- Toute modification de la base passe par une migration Alembic, et non par l'interface de Supabase
- L'application ne lit jamais directement la base : elle passe par l'API du serveur
- Les ingrédients des recettes utilisent les mêmes identifiants que le catalogue des produits, pour relier ensuite recettes et promotions
- Chaque utilisateur ne peut modifier que ses propres recettes et photos

### Difficultés rencontrées

- Validation des recettes : quantités et unités cohérentes (g, ml, unité) et ingrédients existants dans le catalogue
- Import des recettes rejouable sans créer de doublons ni écraser les modifications
---

## Semaine 8 (19 octobre - 25 octobre)

### Objectifs de la période

- Appliquer les remarques du professeur sur le format des données de prix
- Développer la page Promos : serveur et application mobile
- Ajouter les promotions dans la base de données

### Travail réalisé

- **Données des trois magasins**
    - Ajout du prix en promotion (`PrixPromo`), de la date de récupération (`DateRecuperation`) et d'un numéro de catégorie (8 catégories communes)
    - Regroupement dans un catalogue commun de 31 ingrédients et 93 produits
- **Serveur**
    - Route `/api/v1/offers` : filtres par magasin, ingrédient, catégorie et date
    - Migration Alembic (tables `category` et `product_offer`) et import rejouable sans doublons
    - Lecture des offres dans PostgreSQL
- **Application mobile**
    - Écran Promos selon la maquette Figma : recherche, filtre par magasin, rabais en pourcentage
    - Détail d'une promotion : prix promo, prix régulier, prix au kilo, dates de validité, lien vers le magasin
    - Écran « Cuisiner avec les promos » : recettes dont des ingrédients sont en promotion

### Décisions et ajustements

- Séparer le prix de base (`Prix`) et le prix en promotion (`PrixPromo`), sans estimer de prix régulier
- Développer d'abord la page Promos avec les fichiers JSON, puis la brancher sur PostgreSQL
- Créer des tables séparées pour les promotions, reliées aux ingrédients existants sans modifier les tables des recettes
- Relier les recettes et les promotions par l'ingrédient, pour proposer « Cuisiner avec les promos »
- Afficher seulement les promotions en cours à la date du jour

### Difficultés rencontrées

- Connexion du téléphone au serveur en Wi-Fi (pare-feu Windows, adresse IP qui change selon le réseau) ; solution de secours par câble USB
- Données de test anciennes : la plupart des promotions étaient déjà terminées

---

## Semaine 9 (26 octobre – 1er novembre)

### Objectifs de la période

- Compléter l’intégration des comptes, des recettes et des promotions
- Permettre la consultation sans compte et demander la connexion pour les actions personnelles
- Vérifier les nouveaux parcours sur iOS

### Travail réalisé

- Ajout du mode visiteur pour consulter Accueil, Promos, Recettes et Paramètres
- Connexion proposée lors des actions personnelles, avec possibilité de poursuivre sans compte
- Photo obligatoire à la création d’une recette, avec validation dans le mobile et l’API
- Nom obligatoire pour activer l’enregistrement d’une recette ; quantité séparée de l’unité, choisie parmi les boutons g, ml et unité
- Développement du backend du partage : migration 0009, visibilité privée par défaut, publication et retrait par le propriétaire, sections API Découvrir/Mes recettes/Favoris et contrôle de visibilité dans les favoris et le calendrier. Les sections mobiles Découvrir, Mes recettes et Favoris sont intégrées ; le choix de publication est également intégré dans le formulaire et le détail, avec confirmation. Pour le prototype, nous conservons le même bucket public de photos ; la séparation privé/public du stockage sera réalisée après le prototype.
- Ajout des photos de produits dans les cartes et détails des promotions
- Ajout de la suppression du compte dans Paramètres, avec confirmation explicite, nettoyage des photos et retour au mode visiteur
- Actualisation des promotions et consultation des circulaires
- Intégration du calendrier développé par notre coéquipier : navigation par semaine, repas par recette ou note, portions, déplacement, duplication et restes ; la migration 0008 crée les entrées en base

### Vérifications

Le 1er novembre 2026, Hamza a confirmé le fonctionnement sur iOS du mode visiteur, de la connexion à la demande, de la photo obligatoire à la création, des photos de produits dans Promos et de la suppression du compte. Cette confirmation générale ne constitue pas un résultat individuel pour chaque scénario d’erreur. Les nouveaux parcours restent à reproduire sur Android.

Hamza a également confirmé le 1er novembre l’application de `0008_meal_plan`
sur Supabase et le fonctionnement du calendrier sur iOS. L’historique figé
par instantanés reste à développer.

Hamza a confirmé sur iOS le 1er novembre le blocage de l’enregistrement sans nom et le fonctionnement de la quantité séparée du choix fixe de l’unité. Ces ajustements restent à vérifier sur Android.

Pour le backend du partage, la suite sur PostgreSQL local jetable donne
365 tests réussis et 1 ignoré ; les 38 tests mobiles et TypeScript passent.
La migration et les autorisations ont été vérifiées avec deux comptes, y compris
le retrait d’une recette publique déjà ajoutée aux favoris et au calendrier.
La migration `0009_recipe_visibility` a ensuite été appliquée sur Supabase le 1er novembre. Le schéma est conforme aux modèles et les comptages des neuf tables applicatives sont identiques avant et après : les 10 recettes initiales sont publiques et les 10 repas planifiés sont conservés. Aucune recette personnelle n’était présente lors de cette application.

Le maintien des photos dans le bucket public a été vérifié par 35 tests backend
ciblés sur PostgreSQL local : URL conservée à la publication et au retrait,
droits d’écriture par propriétaire et suppression des comptes pour les deux
visibilités. Les 38 tests mobiles et TypeScript passent. Le formulaire précise
que la photo reste accessible par son lien même pour une recette privée ;
ce nouveau message reste à vérifier sur téléphone.

### Prochaines étapes

- Reproduire les nouveaux parcours sur Android, y compris le calendrier
- Compléter les scénarios d’erreur réseau et les essais sur différentes tailles d’écran
- Développer les instantanés historiques des plans et les listes d’épicerie

### Sections Recettes — 1er novembre

Nous avons séparé Découvrir, Mes recettes et Favoris dans l’écran Recettes,
avec connexion demandée pour les deux sections personnelles. La recherche et
les filtres s’appliquent à la section active ; la pagination repart à la première
page lorsqu’on change de section. Les listes vides proposent une action adaptée.
Les cartes affichent leur source et les créations du compte leur visibilité.
Les réponses tardives d’une section précédente sont ignorées.

Les 44 tests mobiles et TypeScript passent. Le lint n’est pas configuré. Les
essais iOS et Android de ces nouvelles sections restent à effectuer.

### Publication depuis le mobile — 1er novembre

Le formulaire permet de garder une recette privée ou de la partager, avec
statut privé par défaut à la création et reprise du statut courant en édition.
Le détail propose au propriétaire de publier ou rendre privée sa recette.
Une confirmation précède ces changements ; le statut confirmé vient du serveur.
Le retrait du public précède les modifications du contenu, tandis qu’une
publication suit leur enregistrement. Les échecs entre les deux opérations
sont signalés pour permettre de réessayer sans annoncer un faux succès.

Les 60 tests mobiles et TypeScript passent. Ils couvrent les confirmations,
l’annulation, les deux visibilités, l’ordre des requêtes, les erreurs et les
sauvegardes partielles. Le lint reste non configuré. Les validations distinctes iOS et Android restent à consigner ; le bucket de
photos reste public pendant le prototype.

Le 1er novembre 2026, Hamza a confirmé les trois scénarios manuels de partage : création privée puis publication, retrait avec masquage des favoris puis republication, et choix de visibilité dans le formulaire avec contrôle des actions du propriétaire. La plateforme de cet essai n’a pas été précisée ; cette confirmation ne valide pas séparément iOS et Android ni les scénarios d’erreur réseau.

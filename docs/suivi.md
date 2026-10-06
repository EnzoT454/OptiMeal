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

- Mise en place d’un connecteur Apify pour récupérer les produits et les prix de Maxi Côte-des-Neiges
    - Recherches réparties en trois lots couvrant 31 ingrédients
    - Ajout de la collecte des promotions alimentaires
    - Conservation des réponses pour pouvoir les vérifier et les retraiter sans nouvelle collecte
    - Vérification par Hamza des données Maxi récupérées : les produits, les prix et la succursale sont corrects
    - Mise au même format que Super C des 31 produits et des 196 promotions Maxi ; la validation et les détails techniques sont conservés dans le guide et les archives
- Ajout de routes FastAPI pour consulter le catalogue collecté
- Préparation d’un modèle de données pour les ingrédients, les produits, les prix et les reçus ; la base PostgreSQL n’est pas encore créée
- Mise en place de l’extraction locale des reçus avec Apple Vision sur Mac et Tesseract + OpenCV pour Windows
    - Amélioration de la lecture des articles, des quantités et des rabais
    - Vérification des montants sur quatre reçus Maxi et Metro avec Tesseract + OpenCV
    - Le 4 octobre, Hamza a vérifié et confirmé les prix extraits de cet échantillon

### Décisions et ajustements

- Utiliser Apify pour les données Maxi
- Utiliser l’extraction web avec un modèle IA pour Metro et Super C ; cette partie reste à développer
- Ne plus utiliser épiceries.ca ni poursuivre l’extraction des circulaires PDF comme source de données
- Conserver les deux méthodes de lecture des reçus : Apple Vision pour Mac et Tesseract + OpenCV pour Windows

### Difficultés rencontrées

- Les recherches Apify ont parfois retourné des produits proches de l’ingrédient demandé. Une sélection a été nécessaire avant de vérifier les produits retenus
- La lecture du rabais Metro a demandé un modèle Tesseract complémentaire. Apple Vision lit encore ce rabais incorrectement
- Les essais Tesseract ont été réalisés sur Mac ; le fonctionnement sur un PC Windows et la lecture des reçus Super C restent à vérifier
- Les reçus restent locaux : leur correction et leur confirmation ne sont pas encore intégrées à l’application ou à la base de données

### Prochaines étapes

- Développer et évaluer la collecte web pour Metro et Super C
- Reproduire les essais de reçus sur Windows et ajouter un reçu Super C
- Mettre en place PostgreSQL et commencer la connexion entre le mobile et le serveur

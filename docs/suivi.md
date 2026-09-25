---
title: Suivi du projet
---

<style>
    @media screen and (min-width: 76em) {
        .md-sidebar--primary {
            display: none !important;
        }
    }
</style>

# Suivi de projet

## Septembre 2026 — Préparation du projet

La description d’OptiMeal a été rédigée : contexte, problématique, objectifs, méthodologie et critères d’évaluation. Le site de suivi a été adapté aux consignes du cours.

Une première API FastAPI intègre épiceries.ca comme source optionnelle de prix. La recherche et la normalisation sont testées ; les prix anciens ou incohérents sont signalés. Les essais sur les circulaires PDF ont montré des difficultés de lecture des prix.

La prochaine étape sera de vérifier un échantillon de prix et de relier l’application mobile au serveur.

Cette page sera mise à jour chaque semaine avec les avancées, les difficultés, les choix effectués et les prochaines étapes, en lien avec les rencontres de supervision.

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
- **Magasins** : carte avec géolocalisation, incluant les petits magasins
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

- Limitation à trois magasins (Maxi, Metro, Super C) pour faciliter
    le travail ; d'autres pourront être ajoutés plus tard
- Les circulaires PDF ne seront pas la source principale, à cause des
    problèmes d'exactitude et de disponibilité
- Poursuite des essais d'extraction avec ChatGPT
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

- Continuer les essais d'extraction avec ChatGPT sur d'autres produits
- Tester OpenCV et pytesseract comme plan B pour l'extraction des photos
- Construire notre base de données à partir des données obtenues
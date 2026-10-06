---
title: Vue d'ensemble du projet
---

<style>
    @media screen and (min-width: 76em) {
        .md-sidebar--primary {
            display: none !important;
        }
    }
</style>

# Vue d'ensemble du projet

!!! info "Informations générales"
    **Session**: Automne 2026  
    **Auteur(s)**: Hamza Aqel (20111814), Nouh Harfouche (20262136)<!-- Nom de chaque membre (matricule)  -->  
    **Thème(s)**: Développement, innovation<!-- Thèmes principaux abordés dans le projet  -->  
    **Superviseur(s)**: Louis Edouard Lafontant<!-- Nom du superviseur (affiliation)  -->  
    **Collaborateur(s):** <!-- Nom de(s) collaborateur(s) et partenaire(s)` -->  

## Contexte

OptiMeal est un projet d’application mobile réalisé dans le cadre du cours IFT3150 à l’Université de Montréal. Il s’inscrit dans le domaine de la planification des repas et de la gestion du budget d’épicerie.

Préparer les repas de la semaine demande de choisir des recettes, de vérifier les ingrédients nécessaires et de consulter les offres des épiceries. Ces informations étant souvent dispersées, leur regroupement représente un travail répétitif pour les personnes qui souhaitent organiser leurs achats et maîtriser leurs dépenses.

## Problématique

Comment passer d’un choix de repas à une liste d’achats adaptée à son budget et aux magasins que l’on peut visiter ? Il faut additionner les ingrédients communs aux recettes, ajuster les quantités aux portions et aux formats vendus, puis comparer les prix disponibles.

Le produit le moins cher ne constitue pas toujours le meilleur choix s’il impose un déplacement supplémentaire. De plus, certaines promotions ou certains prix peuvent manquer. Le défi est donc de proposer une liste utile tout en indiquant clairement les besoins non couverts et les coûts incertains.

## Proposition et objectifs

Nous proposons **OptiMeal**, une application sur iOS et Android qui réunira recettes, calendrier de repas et liste d’épicerie modifiable par magasin. L’utilisateur pourra préciser son budget, le nombre maximal de magasins, ses préférences alimentaires et ses contraintes de déplacement.

Les principaux objectifs sont les suivants :

- **Gérer et découvrir des recettes** : permettre la création, la modification, la recherche et les favoris, avec trois modes d’ajout : ajout manuel, suggestion selon une envie et suggestion à partir des ingrédients disponibles. Pour l’ajout manuel, l’utilisateur choisira entre remplir un formulaire et saisir un texte que l’IA transformera dans le même format de recette. Les propositions de l’IA pourront être corrigées avant confirmation et sauvegarde.
- **Planifier et conserver les repas** : enregistrer une semaine et ses portions dans un compte personnel, puis retrouver les anciennes semaines et leurs listes sans que des modifications ultérieures changent leur contenu historique.
- **Préparer les achats** : regrouper les quantités nécessaires et produire une liste par magasin tenant compte des formats, des prix et des contraintes choisies. L’utilisateur pourra cocher, supprimer ou remplacer des articles, avec recalcul et conservation de ses choix manuels.
- **Aider aux choix économiques** : proposer des recettes selon les promotions et un catalogue couvrant aussi les produits hors promotion. Distinguer les prix connus, déclarés après achat, estimés et inconnus ; permettre à l’utilisateur de photographier son reçu à la fin de ses courses pour contribuer, s’il le souhaite, aux prix payés. Il pourra vérifier et corriger les informations extraites avant de les confirmer pour améliorer les estimations.

L’application cherchera à réduire le coût des achats, sans garantir le meilleur panier possible parmi toutes les combinaisons. Lorsque les données ne permettent pas de donner un prix précis, elle affichera une fourchette estimée min–max à partir des références disponibles. Si certains prix ne peuvent pas être estimés, ils seront signalés : la fourchette portera alors seulement sur la partie calculable de la liste.

Le dépôt contient un backend FastAPI, une collecte Maxi avec Apify, des échantillons Metro et Super C et une extraction locale de reçus. Un essai de récupération directe des données Maxi via PC Express a réussi sur cinq produits ; nous attendons l’avis du professeur avant de poursuivre cette piste. Le mobile, les comptes et la persistance restent à développer.

## Méthodologie

Le travail sera réalisé par 2 étudiants sur environ 15 semaines, à raison de 20 heures par semaine chacun incluant développement, tests, réunions et documentation. Une marge pour les imprévus et du temps pour le rapport et la démonstration seront réservés.

La démarche sera progressive : préciser les parcours et étudier les sources de données, établir la communication entre le mobile et le serveur, puis développer les comptes, les recettes et le calendrier. Le catalogue, les promotions et les estimations permettront ensuite de construire les listes d’achats et les recommandations économiques. Chaque étape sera intégrée et vérifiée avant de poursuivre ; la charge restante sera réévaluée régulièrement.

L’interface utilisera **React Native avec TypeScript et Expo**, le serveur **Python avec FastAPI**, et le stockage **PostgreSQL**. L’IA sera évaluée pour proposer des recettes, structurer un texte de recette et extraire les prix des pages web de Metro et Super C. Les résultats seront vérifiés ; les calculs de quantités et de prix seront effectués par le serveur.

Les reçus sont lus avec Apple Vision sur Mac et Tesseract + OpenCV, dont le fonctionnement sur Windows reste à vérifier. Apify reste la source retenue pour Maxi. Les échantillons Metro et Super C sont disponibles au format JSON ; leur validation et leur collecte automatisée restent à compléter.

Un jeu de données de démonstration clairement identifié permettra de tester le projet même si les sources externes sont indisponibles. Le travail sera versionné avec Git et documenté régulièrement sur la page de [suivi](suivi.md).

## Évaluation

L’évaluation reposera sur des scénarios reproductibles et des données dont les résultats attendus peuvent être vérifiés manuellement. Les critères suivants permettront de juger l’atteinte des objectifs :

| Aspect évalué | Stratégie et critères prévus |
| --- | --- |
| Fonctionnement de l’application | Exécuter sur iOS et Android les trois modes d’ajout, dont les options formulaire et texte du mode manuel, la contribution facultative par photo du reçu, la sauvegarde d’une semaine, la génération et la modification d’une liste. Relever les scénarios réussis, les échecs et les fonctions incomplètes. |
| Exactitude des listes | Comparer les quantités, les formats à acheter et les totaux à des calculs manuels sur de petits exemples. Vérifier que chaque besoin est couvert ou explicitement signalé comme manquant ou non vérifiable. |
| Qualité des choix économiques | Sur un même jeu de prix connus, comparer le panier proposé à un panier de référence construit manuellement pour les mêmes besoins et contraintes. Mesurer l’écart de coût et le nombre de magasins, sans supposer un gain systématique. |
| Fiabilité des données et de l’IA | Comparer les ingrédients, quantités, prix et dates extraits à des exemples annotés manuellement. Relever les omissions, ajouts incorrects et ambiguïtés ; vérifier la lecture des reçus, les fourchettes min–max et le signalement des prix inconnus et des offres expirées. |
| Protection et conservation des données | Vérifier avec deux comptes que les données privées restent séparées et qu’une modification de recette ou de prix ne change pas les anciennes semaines. |
| Utilisabilité et gestion des erreurs | Réaliser le parcours complet de planification et d’achat ; relever les blocages et vérifier les états de chargement, de contenu vide et d’erreur réseau, ainsi que la clarté des avertissements. |

Les résultats, les limites observées et les fonctionnalités effectivement réalisées seront présentés dans la [synthèse](synthese.md). Des tests du backend et des vérifications sur les données et les reçus ont été réalisés ; l’application complète reste à évaluer.


## Échéancier
 
  Le suivi complet est disponible dans la page [Suivi de projet](suivi.md).

| Activités | Début | Fin | Livrable | Statut |
| --- | --- | --- | --- | --- |
| Description du projet et cas d’utilisation | 31 août | 6 sept. | Description du projet et cas d’utilisation | ✅ Terminé |
| Recherche d’applications similaires et début du prototype sur Figma | 7 sept. | 13 sept. | Recherche comparative et prototype initial sur Figma | ✅ Terminé |
| Analyse des applications existantes, prototype et modèle C4 | 14 sept. | 20 sept. | Présentation au professeur | ✅ Terminé |
| Évaluation initiale des sources de données et tests d'extraction (circulaires, reçus) | 21 sept. | 27 sept. | Résultats des tests initiaux et choix d’une méthode | ✅ Terminé |
| Poursuite de l'extraction et construction de la base de données | 28 sept. | 4 oct. | Collectes Maxi, OCR des reçus et modèle de base proposé ; persistance à réaliser | 🔄 En cours |
| Exploration de PC Express et ajout de l’échantillon Metro | 5 oct. | 11 oct. | Essai sur cinq produits Maxi et échantillon Metro au format JSON ; avis du professeur à recueillir | 🔄 En cours |

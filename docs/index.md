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

Nous développons **OptiMeal**, une application sur iOS et Android qui réunit recettes, calendrier de repas et liste d’épicerie modifiable par magasin. Elle permet de préparer ses courses et de comparer les prix disponibles.

Les principaux objectifs sont les suivants :

- **Gérer et découvrir des recettes** : créer ses recettes manuellement, les rechercher, les publier, les ajouter aux favoris et évaluer les recettes publiques d’autres utilisateurs.
- **Planifier les repas** : organiser une semaine et ajuster les portions dans son calendrier.
- **Préparer les achats** : regrouper les ingrédients nécessaires, comparer les prix par magasin et suivre les achats dans une liste modifiable.
- **Aider aux choix économiques** : consulter les promotions et les circulaires, retrouver les recettes associées aux promotions et signaler les besoins sans prix connu.

Le 17 novembre 2026, nous avons décidé de concentrer le projet sur la stabilisation du socle actuel et les tests utilisateurs. Les modes IA, la gestion avancée du budget, l’historique stable des plans et des prix, les estimations et la contribution par reçu sont retirés du périmètre. Les listes terminées restent conservées en base, sans accès à un historique depuis l’index actuel. Les outils de lecture locale des reçus sont conservés.

Les recettes, le calendrier, les promotions, les circulaires et les listes d’épicerie sont intégrés. Les vérifications des listes, de l’Accueil, du parcours Recettes et des exclusions sont terminées. Nous poursuivons la stabilisation de l’application et la préparation des tests utilisateurs.


## Méthodologie

Le travail sera réalisé par 2 étudiants sur environ 15 semaines, à raison de 20 heures par semaine chacun incluant développement, tests, réunions et documentation. Une marge pour les imprévus et du temps pour le rapport et la démonstration seront réservés.

Nous avons avancé progressivement : étude des parcours et des sources de données, connexion entre le mobile et le serveur, puis intégration des comptes, des recettes, du calendrier et des listes d’achats. Le catalogue et les promotions alimentent les comparaisons de prix. Nous concentrons maintenant les efforts sur la vérification des parcours existants, les corrections et les retours des utilisateurs.

L’interface utilise **React Native avec TypeScript et Expo**, le serveur **Python avec FastAPI**, et **Supabase** pour les comptes, la base **PostgreSQL** et les images. Les calculs de quantités et de prix sont effectués par le serveur à partir des données du catalogue.

Les outils de lecture locale des reçus utilisent Apple Vision sur Mac et Tesseract + OpenCV, dont le fonctionnement sur Windows reste à vérifier. Leur intégration dans un parcours de contribution est abandonnée. Apify reste la source retenue pour Maxi. Les échantillons Metro et Super C sont disponibles au format JSON ; leur collecte automatisée reste à compléter, sans être la priorité de cette phase de stabilisation.

Un jeu de données de démonstration clairement identifié permettra de tester le projet même si les sources externes sont indisponibles. Le travail sera versionné avec Git et documenté régulièrement sur la page de [suivi](suivi.md).

## Présentations

- [Mise en commun 1](https://docs.google.com/presentation/d/1skVqsbFZVD1j_ma6rDc_bpBKRceYy8vY/edit?usp=sharing&ouid=104449491614107286982&rtpof=true&sd=true)
- [Mise en commun 2](https://docs.google.com/presentation/d/15weJ4EC047wjhogrRLl6jSa6O5zollpE/edit?usp=sharing&ouid=104449491614107286982&rtpof=true&sd=true)

## Évaluation

L’évaluation reposera sur des scénarios reproductibles et des données dont les résultats attendus peuvent être vérifiés manuellement. Les critères suivants permettront de juger l’atteinte des objectifs :

| Aspect évalué | Stratégie et critères prévus |
| --- | --- |
| Fonctionnement de l’application | Exécuter sur iOS et Android les parcours de compte, de recettes manuelles, de favoris, de notation, de calendrier, de promotions et de listes d’épicerie. Relever les scénarios réussis et les échecs. |
| Exactitude des listes | Comparer les quantités, les formats à acheter et les totaux à des calculs manuels sur de petits exemples. Vérifier que chaque besoin est couvert ou explicitement signalé comme manquant ou non vérifiable. |
| Qualité des choix économiques | Sur un même jeu de prix connus, comparer le panier proposé à un panier de référence construit manuellement pour les mêmes besoins et contraintes. Mesurer l’écart de coût et le nombre de magasins, sans supposer un gain systématique. |
| Fiabilité des données | Vérifier les produits, formats, prix, dates et conditions des promotions du catalogue. Contrôler le signalement des prix inconnus et des offres expirées. |
| Protection et conservation des données | Vérifier avec deux comptes que les données privées restent séparées, qu’une liste créée reste indépendante des changements du calendrier et qu’un recalcul conserve les achats enregistrés. |
| Utilisabilité et gestion des erreurs | Faire essayer les parcours de recettes, de planification et d’achat à des utilisateurs ; recueillir leurs retours et relever les blocages. Vérifier les états de chargement, de contenu vide et d’erreur réseau, ainsi que la clarté des avertissements. |

Les résultats, les limites observées et les fonctionnalités effectivement réalisées seront présentés dans la [synthèse](synthese.md). Des tests du backend et du mobile, des vérifications sur les données et les reçus ainsi que des essais sur téléphone ont été réalisés. Les vérifications des parcours récents sont terminées ; les tests utilisateurs restent à mener.


## Échéancier

Les périodes ci-dessous reprennent le travail présenté dans le [suivi de projet](suivi.md). Les statuts correspondent à l’état au 23 novembre 2026. La priorité est de poursuivre la stabilisation de l’application et de préparer les tests utilisateurs.

| Activités | Début | Fin | Livrable | Statut |
| --- | --- | --- | --- | --- |
| Description du projet et cas d’utilisation | 31 août | 6 sept. | Description du projet et cas d’utilisation | ✅ Terminé |
| Recherche d’applications similaires et début du prototype sur Figma | 7 sept. | 13 sept. | Recherche comparative et prototype initial | ✅ Terminé |
| Analyse des applications existantes, prototype et modèle C4 | 14 sept. | 20 sept. | Présentation au professeur | ✅ Terminé |
| Évaluation initiale des sources et essais d’extraction | 21 sept. | 27 sept. | Comparaison des méthodes de collecte et de lecture des reçus | ✅ Terminé |
| Collecte Maxi, lecture des reçus et préparation du modèle de données | 28 sept. | 4 oct. | Données Maxi avec Apify, essais OCR Maxi/Metro et modèle proposé | ✅ Terminé |
| Exploration de PC Express et ajout de l’échantillon Metro | 5 oct. | 11 oct. | Essai sur cinq produits Maxi et échantillon Metro ; avis du professeur encore attendu sur la poursuite de PC Express | ✅ Terminé |
| Mise en place de la base, des comptes et du parcours Recettes | 12 oct. | 18 oct. | Persistance PostgreSQL, comptes, recettes manuelles et favoris | ✅ Terminé |
| Catalogue commun et développement de l’onglet Promos | 19 oct. | 25 oct. | Catalogue des trois enseignes, offres en base et recettes associées aux promotions | ✅ Terminé |
| Comptes et partage des recettes | 26 oct. | 1 nov. | Mode visiteur, suppression du compte, sections Découvrir/Mes recettes/Favoris et partage public ou privé | ✅ Terminé |
| Promotions et circulaires | 26 oct. | 1 nov. | Photos des produits, promotions actualisées et consultation des circulaires | ✅ Terminé |
| Calendrier des repas | 26 oct. | 1 nov. | Calendrier hebdomadaire avec portions et actions sur les repas ; conservation des repas dont la recette devient indisponible | ✅ Terminé |
| Essais sur iOS et scénarios de partage | 26 oct. | 1 nov. | Essais réalisés sur les nouveaux parcours ; validation complète sur iOS et Android à poursuivre | ✅ Terminé |
| Notation des recettes | 2 nov. | 8 nov. | Trois critères, classement ajusté, réévaluation après changement de contenu et validation sur téléphone | ✅ Terminé |
| Durées des recettes | 9 nov. | 15 nov. | Durées par étape| ✅ Terminé |
| Listes d’épicerie | 9 nov. | 23 nov. | Listes d’articles ou de produits, création depuis le calendrier, comparaison des prix, achats et sauvegardes réutilisables ; listes terminées conservées en base | ✅ Terminé |
| Onglet Accueil | 16 nov. | 23 nov. | Repas à venir du jour ou du lendemain, listes récentes en cours et promotions suivies | ✅ Terminé |
| Parcours Recettes | 20 nov. | 20 nov. | Création guidée en cinq étapes, photos sur navigateur et classement Petit budget | ✅ Terminé |
| Ajustements Accueil et exclusions | 22 nov. | 22 nov. | Accueil compact limité à deux repas à venir et gestion simplifiée des ingrédients non suggérés | ✅ Terminé |
| Version stable et tests utilisateurs | À planifier | À planifier | Validation sur iOS et Android, stabilisation et essais avec des utilisateurs | ⏳ À préparer |
| Collecte Metro et Super C, préférences et recommandations | À planifier | À planifier | Collecte automatisée des prix, préférences détaillées et recommandations économiques | En attente ; priorité à la stabilisation |

*Dernière mise à jour : 23 novembre 2026*

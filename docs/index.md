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

Nous proposons **OptiMeal**, une application sur iOS et Android qui réunira recettes, calendrier de repas et liste d’épicerie modifiable par magasin. L’utilisateur pourra préciser son budget, ses préférences alimentaires et les magasins qu’il souhaite visiter.

Les principaux objectifs sont les suivants :

- **Gérer et découvrir des recettes** : créer ses recettes, les rechercher, les ajouter aux favoris et évaluer les recettes publiques d’autres utilisateurs. Trois modes d’ajout sont prévus : manuel, selon une envie et à partir des ingrédients disponibles. Le mode manuel proposera un formulaire ou un texte à structurer par l’IA, avec vérification avant sauvegarde.
- **Planifier les repas** : organiser une semaine, ajuster les portions et retrouver ses anciennes semaines dans son compte.
- **Préparer les achats** : regrouper les ingrédients nécessaires dans une liste par magasin, en tenant compte des prix et des contraintes choisies, puis permettre de cocher, supprimer ou remplacer les articles.
- **Aider aux choix économiques** : proposer des recettes selon les promotions, signaler les prix incertains et permettre de contribuer aux données de prix par un reçu vérifié, de façon facultative.

Lorsque les prix précis manquent, l’application affichera une fourchette estimée et signalera les articles dont le coût ne peut pas être estimé.


## Méthodologie

Le travail sera réalisé par 2 étudiants sur environ 15 semaines, à raison de 20 heures par semaine chacun incluant développement, tests, réunions et documentation. Une marge pour les imprévus et du temps pour le rapport et la démonstration seront réservés.

Nous avançons progressivement : étude des parcours et des sources de données, connexion entre le mobile et le serveur, puis intégration des comptes, des recettes, du calendrier et des listes d’achats. Le catalogue et les promotions alimentent les comparaisons de prix ; les estimations et les recommandations économiques restent à compléter. Chaque étape est intégrée et vérifiée, puis la charge restante est réévaluée.

L’interface utilise **React Native avec TypeScript et Expo**, le serveur **Python avec FastAPI**, et **Supabase** pour les comptes, la base **PostgreSQL** et les images. L’IA sera évaluée pour proposer des recettes, structurer un texte de recette et extraire les prix des pages web de Metro et Super C. Les résultats seront vérifiés ; les calculs de quantités et de prix sont effectués par le serveur.

Les reçus sont lus avec Apple Vision sur Mac et Tesseract + OpenCV, dont le fonctionnement sur Windows reste à vérifier. Apify reste la source retenue pour Maxi. Les échantillons Metro et Super C sont disponibles au format JSON ; leur validation et leur collecte automatisée restent à compléter.

Un jeu de données de démonstration clairement identifié permettra de tester le projet même si les sources externes sont indisponibles. Le travail sera versionné avec Git et documenté régulièrement sur la page de [suivi](suivi.md).

## Présentations

- [Mise en commun 1](https://docs.google.com/presentation/d/1skVqsbFZVD1j_ma6rDc_bpBKRceYy8vY/edit?usp=sharing&ouid=104449491614107286982&rtpof=true&sd=true)
- [Mise en commun 2](https://docs.google.com/presentation/d/15weJ4EC047wjhogrRLl6jSa6O5zollpE/edit?usp=sharing&ouid=104449491614107286982&rtpof=true&sd=true)

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

Les résultats, les limites observées et les fonctionnalités effectivement réalisées seront présentés dans la [synthèse](synthese.md). Des tests du backend et du mobile, des vérifications sur les données et les reçus ainsi que des essais sur téléphone ont été réalisés. L’évaluation complète sur iOS et Android et les tests utilisateurs restent à mener.


## Échéancier

Les périodes ci-dessous reprennent le travail présenté dans le [suivi de projet](suivi.md). Les statuts correspondent à l’état au 17 novembre 2026. La priorité est de stabiliser l’application et de valider les parcours sur appareils avant de commencer les tests utilisateurs. Les dates des fonctionnalités restantes restent à planifier.

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
| Listes d’épicerie | 9 nov. | En cours | Création manuelle ou depuis le calendrier, prix par magasin, suivi des achats, modèles et historique des listes terminées | Intégré ; validation finale en cours |
| Onglet Accueil | 16 nov. | En cours | Repas du jour et accès à la liste épinglée | Intégré ; validation finale en cours |
| Version stable et tests utilisateurs | À planifier | À planifier | Validation sur iOS et Android, stabilisation et essais avec des utilisateurs | ⏳ À préparer |
| Historique stable des plans et des prix | À planifier | À planifier | Conservation des anciennes semaines et des prix utilisés | ⏳ À développer |
| Modes IA, budget, estimations et recommandations | À planifier | À planifier | Aide aux recettes, gestion avancée du budget, contribution par reçu et recommandations économiques | ⏳ À développer ou à compléter |
| Collecte Metro et Super C et préférences de compte | À planifier | À planifier | Collecte automatisée des prix et préférences détaillées | ⏳ À développer |

*Dernière mise à jour : 17 novembre 2026*

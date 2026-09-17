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

Nous proposons **OptiMeal**, une application sur **iOS et Android** qui réunira recettes, calendrier de repas et liste d’épicerie modifiable par magasin. L’utilisateur pourra préciser son budget, le nombre maximal de magasins, ses préférences alimentaires et ses contraintes de déplacement. Le parcours **recettes → planification → liste d’achats** sera prioritaire.

Les principaux objectifs sont les suivants :

- **Gérer et découvrir des recettes** : permettre la création, la modification, la recherche et les favoris, avec quatre modes d’ajout — saisie manuelle, suggestion selon une envie, suggestion à partir des ingrédients déclarés et import d’un texte. Les propositions de l’IA pourront être corrigées avant confirmation et sauvegarde.
- **Planifier et conserver les repas** : enregistrer une semaine et ses portions dans un compte personnel, puis retrouver les anciennes semaines et leurs listes sans que des modifications ultérieures changent leur contenu historique.
- **Préparer les achats** : regrouper les quantités nécessaires et produire une liste par magasin tenant compte des formats, des prix et des contraintes choisies. L’utilisateur pourra cocher, supprimer ou remplacer des articles, avec recalcul et conservation de ses choix manuels.
- **Aider aux choix économiques** : proposer des recettes selon les promotions et un catalogue couvrant aussi les produits hors promotion. Distinguer les prix connus, déclarés après achat, estimés et inconnus ; permettre une contribution facultative du prix payé pour améliorer les estimations après validation.

L’application cherchera à réduire le coût des achats, sans garantir le meilleur panier possible parmi toutes les combinaisons. Lorsque les données sont insuffisantes, elle présentera les limites du résultat plutôt qu’un budget garanti. À ce stade, le dépôt contient la documentation et le cadrage ; l’application reste à développer.

## Méthodologie

Le travail sera réalisé par deux étudiants sur environ **15 semaines**, à raison de **20 heures par semaine chacun** incluant développement, tests, réunions et documentation. Une marge pour les imprévus et du temps pour le rapport et la démonstration seront réservés.

La démarche sera progressive : préciser les parcours et étudier les sources de données, établir la communication entre le mobile et le serveur, puis développer les comptes, les recettes et le calendrier. Le catalogue, les circulaires et les estimations permettront ensuite de construire les listes d’achats et les recommandations économiques. Chaque étape sera intégrée et vérifiée avant de poursuivre ; la charge restante sera réévaluée régulièrement.

L’interface utilisera **React Native avec TypeScript et Expo**, le serveur **Python avec FastAPI**, et le stockage **PostgreSQL**. L’IA sera évaluée pour proposer des recettes, structurer un texte de recette et extraire les informations des circulaires. Ses résultats seront validés ; les calculs de quantités et de prix seront effectués par le serveur. Les fournisseurs et les sources de données seront sélectionnés après comparaison sur des exemples représentatifs.

Un jeu de données de démonstration clairement identifié permettra de tester le projet même si les sources externes sont indisponibles. Le travail sera versionné avec Git et documenté régulièrement sur la page de [suivi](suivi.md).

## Évaluation

L’évaluation reposera sur des scénarios reproductibles et des données dont les résultats attendus peuvent être vérifiés manuellement. Les critères suivants permettront de juger l’atteinte des objectifs :

| Aspect évalué | Stratégie et critères prévus |
| --- | --- |
| Fonctionnement de l’application | Exécuter sur iOS et Android les quatre modes d’ajout, la sauvegarde d’une semaine, la génération et la modification d’une liste. Relever les scénarios réussis, les échecs et les fonctions incomplètes. |
| Exactitude des listes | Comparer les quantités, les formats à acheter et les totaux à des calculs manuels sur de petits exemples. Vérifier que chaque besoin est couvert ou explicitement signalé comme manquant ou non vérifiable. |
| Qualité des choix économiques | Sur un même jeu de prix connus, comparer le panier proposé à un panier de référence construit manuellement pour les mêmes besoins et contraintes. Mesurer l’écart de coût et le nombre de magasins, sans supposer un gain systématique. |
| Fiabilité des données et de l’IA | Comparer les ingrédients, quantités, prix et dates extraits à des exemples annotés manuellement. Relever les omissions, ajouts incorrects et ambiguïtés ; vérifier le signalement des prix inconnus et des offres expirées. |
| Protection et conservation des données | Vérifier avec deux comptes que les données privées restent séparées et qu’une modification de recette ou de prix ne change pas les anciennes semaines. |
| Utilisabilité et gestion des erreurs | Réaliser le parcours complet de planification et d’achat ; relever les blocages et vérifier les états de chargement, de contenu vide et d’erreur réseau, ainsi que la clarté des avertissements. |

Les résultats, les limites observées et les fonctionnalités effectivement réalisées seront présentés dans la [synthèse](synthese.md). Aucune évaluation fonctionnelle n’a encore été réalisée.

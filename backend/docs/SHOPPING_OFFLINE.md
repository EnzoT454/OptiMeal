# Synchronisation hors connexion — fonctionnalité retirée

À la demande de l’utilisateur le 16 novembre 2026, le cache des listes, la file
persistante des coches, la synchronisation et les contrôles périodiques sont
retirés. `shoppingOffline.ts`, `useOfflineCourses.ts` et leurs tests dédiés sont
supprimés. Accueil lit les listes récentes en cours directement sur le serveur ; la
préférence d’épinglage est conservée sans déterminer les lignes de cet écran.
Les anciennes clés locales ne sont ni lues, ni rejouées, ni réattribuées.

L’onglet exige toujours un compte et une vérification réseau à l’entrée. Une
ouverture charge le contenu courant ; les actions utilisateur l’enregistrent.
Aucun minuteur ou retour au premier plan ne relance des requêtes de Liste.
La reprise d’une seule demande incertaine reste une action manuelle idempotente,
indépendante du mécanisme de synchronisation retiré.

Voir le [parcours actuel de création](SHOPPING_CREATION.md) et la
[présentation de Liste](SHOPPING_OVERVIEW.md).

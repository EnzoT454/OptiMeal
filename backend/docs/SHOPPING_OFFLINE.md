# Courses hors connexion — étape 11

Étape livrée dans le dépôt le 16 novembre 2026. Aucune migration, modification
HTTP ou dépendance supplémentaire. Supabase est désormais vérifié à 0021 après application de cette migration
depuis 0020 le 16 novembre 2026.

## Utilisation

1. Ouvrir une liste avec le réseau pour enregistrer son détail complet sur
   l’appareil : besoins, achats, proposition, estimations, révision et date de
   synchronisation. Les anciennes révisions en consultation seule ne remplacent
   pas ce cache de la liste courante.
2. Sans réseau, retrouver cette liste avec **Ouvrir la liste enregistrée sur cet
   appareil** dans l’onglet Liste. Chaque compte conserve son propre accès.
3. Cocher ou décocher les produits proposés, les achats historiques ou les
   articles sans produit. Les quantités de produits restent modifiables dans
   leur fiche. Le bandeau indique **Hors connexion · dernières données
   enregistrées**, la date de synchronisation et le nombre d’actions en attente.
   Les coches locales sont signalées. Les compteurs, couvertures et montants
   restent ceux confirmés par le serveur jusqu’à synchronisation ; aucun prix
   ou total local concurrent n’est calculé.
4. Le détail réessaie toutes les 15 secondes tant qu’il est monté. **Actualiser
   la liste** déclenche aussi une reprise ; rouvrir la liste après fermeture
   restaure le cache et la file. Il ne s’agit pas d’une tâche native garantie
   en arrière-plan. Pendant un essai réseau, les commandes sont sérialisées.
5. Un conflit conserve l’intention. Lire la liste actualisée, puis choisir
   **Réessayer mon intention sur la liste actualisée** ou **Abandonner cette
   intention locale**. La résolution ne jette jamais une commande dont le
   résultat réseau reste incertain.

Création, import calendrier, comparaison, possession, modification des besoins,
clôture et réutilisation nécessitent le réseau. Les brouillons et la reprise
existants sont conservés. La [récupération des anciennes données privées](SHOPPING_RECOVERY.md)
est livrée séparément à l’étape 12 ; la bascule Accueil/Calendrier reste aux
étapes 13–14.

## Persistance et concurrence

`mobile/services/shoppingOffline.ts` conserve un document versionné par compte
et liste : dernier instantané serveur complet, date et file de commandes. Un
pointeur privé permet de retrouver la dernière liste. Une écriture locale doit
réussir avant tout envoi réseau. Une erreur locale reste visible.

Chaque achat fixe un état cible avec `PUT`, son identité et sa clé idempotente.
Un état jamais envoyé peut être remplacé par une nouvelle intention sur la
même cible. Dès le premier envoi, clé et corps sont conservés exactement, même
si une intention inverse est ajoutée ensuite. Après réponse perdue, la commande
originale est rejouée avant toute réconciliation. Le serveur retrouve son
résultat sans créer de nouvel achat. Les commandes suivantes utilisent la
révision confirmée, jamais un toggle à rejouer.

Un refus `LIST_REVISION_CONFLICT` permet une nouvelle tentative avec nouvelle
clé seulement si les besoins, possessions, choix, proposition et achat ciblé
restent compatibles. Les champs de présentation, le nom et la révision ne
rendent pas seuls l’intention incompatible. Les conflits persistants, changements
de cible, besoins ou proposition nécessitent une décision explicite. Les autres
refus métiers sont conservés comme conflits. Les erreurs réseau, service et
session gardent la commande incertaine. Une ancienne réponse ne remplace pas un
cache plus récent. Une ressource supprimée ou inaccessible n’est pas présentée
comme une lecture hors connexion réussie.

Le stockage par compte et liste sérialise les mises à jour et les envois. Les
réponses d’un compte ou écran devenu ancien sont ignorées. Une déconnexion
masque le cache sans l’attribuer au prochain compte. Après suppression distante
confirmée, `purgeAccountStorage` bloque les écritures tardives, attend celles
déjà lancées et retire uniquement l’espace local de ce compte. Un échec de
nettoyage reste signalé par le parcours de suppression.

## Validation

236 tests mobiles réussis, dont les nouveaux scénarios de cache après
redémarrage, file sans réseau, coche/décoche, réponse perdue après commit,
réconciliation compatible, conflit de besoin ou d’achat distant, session expirée,
réponse tardive après changement de compte, purge avec écriture en cours et
présentation des coches locales. TypeScript, bundles Expo iOS/Android et documentation stricte vérifiés. Les contrats HTTP restent
inchangés ; aucun lint mobile n’est configuré.

Les essais sur appareils restent à consigner séparément : charger une liste,
activer le mode avion, cocher/décocher plusieurs achats, fermer puis rouvrir,
rétablir le réseau, tester une modification sur un autre appareil et changer
de compte. Vérifier également texte agrandi et lecteur d’écran. Les tests et
bundles ne remplacent pas ces essais iOS/Android.

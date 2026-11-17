# Accueil, Calendrier et Liste — étape 13

## Présentation compacte d’Accueil — 16 novembre 2026

Dans Accueil, **Ton épicerie** réutilise `ListSummaryRow`, le même résumé que
l’onglet Liste : nom, icônes/nombres d’articles et magasins, date des courses et
coût total estimé. Les sous-totaux/inconnues gardent « ≥ »/« — » et les libellés
complets du lecteur d’écran. L’état vide se limite à « Aucune liste épinglée. ».
Le bouton Choisir une liste et l’ouverture de l’identifiant épinglé sont conservés.


Étape livrée dans le dépôt le 16 novembre 2026. Les trois accès utilisent
maintenant les listes privées identifiées. Aucun de ces écrans n’instancie
l’ancien `useListeAchats` ni ne calcule son propre panier.

## Depuis Accueil

1. Ouvrir une liste en cours depuis Liste.
2. Dans le menu **…** en haut à droite, choisir **Épingler sur Accueil**. Une seule
   liste peut être épinglée par compte ; une nouvelle préférence remplace
   explicitement la précédente. **Ne plus épingler sur Accueil** la retire.
3. Revenir sur Accueil. La carte **Ton épicerie** indique le nom, puis les icônes
   pour les articles, magasins, date des courses et coût total. Toucher la carte ouvre ce même identifiant dans le
   détail de Liste. **Choisir une liste** ouvre l’accueil des listes.
4. Sans préférence, aucun panier n’est inventé à partir de la semaine courante.
   L’interface invite à épingler une liste. Les visiteurs gardent leur accueil
   de présentation sans charger de données privées.

La préférence est sauvegardée sur le serveur, donc partagée entre appareils.
Une liste terminée ou archivée est masquée sur Accueil. Sa préférence est
conservée : la rouvrir la rend de nouveau visible si aucune autre liste n’a été
épinglée. La suppression de la liste ou du compte supprime la préférence.
L’épinglage ne modifie pas les besoins, achats, montants ou révisions de liste.

Une commande incertaine d’épinglage reprend sa clé et sa cible exactes, même
si l’utilisateur ouvre ensuite une autre liste. Après réponse, le mobile relit
la préférence courante : un ancien résultat idempotent ne remplace pas une
préférence modifiée plus tard sur un autre appareil.

## Depuis Calendrier

1. Sélectionner la semaine voulue, y compris une semaine future ou passée.
2. Passer à **Épicerie**. Les commandes de navigation de semaine restent visibles.
3. Les listes affichées correspondent exactement aux dates de cette semaine,
   avec pagination et statuts, y compris les listes historiques. Une liste sur
   une période différente n’est pas présentée comme la liste de cette semaine.
4. **Créer une liste pour cette période** ouvre le formulaire en mode calendrier
   avec les dates sélectionnées. L’utilisateur vérifie l’aperçu, renseigne son
   nom et sa date de courses, puis confirme comme dans Liste. Les commandes
   incertaines de création sont isolées par période demandée ; une autre semaine
   n’entraîne pas la reprise silencieuse de la première commande.
5. Toucher une liste existante ouvre le détail par son identifiant. Modifier les
   repas ne réécrit pas les listes existantes : ce sont des copies indépendantes.

Le filtre de période porte sur les deux bornes exactes et s’applique en SQL
avant comptage et pagination. Les deux dates sont obligatoires ensemble et
ordonnées. La création générale dans Liste permet toujours une autre période,
notamment plusieurs semaines.

## Montants, cache et données anciennes

`SavedListCard` est partagé par les cartes de Liste, Calendrier et Accueil.
`SavedListTotals` est aussi utilisé dans le détail : les valeurs décimales du
serveur sont affichées sans calcul de prix local. Un sous-total incomplet et
les articles sans estimation restent explicites. L’ancienne carte de promotions
et l’ajout rapide local d’Accueil sont remplacés par l’accès au détail sauvegardé.

Accueil charge la préférence et la liste courante depuis le serveur à l’ouverture.
Il ne conserve plus de copie locale ni de file de synchronisation et ne se replie
pas sur d’anciennes données en cas de panne. L’ouverture du détail exige compte
et réseau. Aucun contrôle périodique n’est exécuté.
Voir [la création complète](SHOPPING_CREATION.md).

## Migration et contrats

La tête Alembic est **0021_shopping_list_pin**, après 0020. Elle crée la table
`shopping_list_pin` : propriétaire en clé primaire, référence à une liste avec
clé étrangère composée `(list_id, owner_id)`, suppression en cascade et RLS sans
politique d’accès direct du mobile. La contrainte composée interdit aussi en base
l’épinglage d’une liste étrangère. Le retour à 0020 refuse d’effacer une préférence
existante. Les commandes réutilisent le verrou de profil et le registre
idempotent des ressources de l’étape 10.

Routes privées sous `/api/v1` :

| Route | Résultat |
| --- | --- |
| `GET /shopping-list-pin` | Enveloppe `Detail`, `item.list_id` UUID ou null |
| `PUT /shopping-list-pin` | Corps `{ "list_id": UUID ou null }`, `Idempotency-Key` requis ; remplacement explicite |
| `GET /shopping-lists?start_date=…&end_date=…` | Liste paginée pour la période exacte ; filtres de collection/statut existants compatibles |

La préférence est dérivée de l’identité du jeton ; aucun propriétaire client
n’est accepté. Les ressources étrangères restent 404 et les listes terminées ou
archivées ne peuvent pas être sélectionnées. Les deux nouveaux schémas, les
exemples et OpenAPI sont exportés et vérifiés contre TypeScript.

**0021 a été appliquée et vérifiée sur Supabase le 16 novembre 2026, depuis
0020, qui était déjà présente lors du contrôle préalable.** Transaction unique,
révision confirmée sur une nouvelle connexion après commit, schéma conforme aux
modèles et protections RLS sans accès mobile direct vérifiés. Les empreintes et
comptages des **25 tables préexistantes** et le nombre de comptes Auth sont
inchangés. La table d’épinglage est vide : aucune préférence utilisateur n’a été
créée pendant la migration.

Pour une autre base à mettre à niveau :

```bash
python -m alembic -c backend/alembic.ini upgrade head
```

## Validation et suite

Suite backend complète : **949 tests réussis, 14 essais OCR réels ignorés** car
opt-in. Puis **7 tests ciblés réussis**, couvrant aussi la migration inverse et
l’épinglage concurrent. Mobile : **277 tests réussis**, TypeScript et 46 exports de contrats
vérifiés. Bundles iOS/Android et documentation stricte réussis.
Le lint mobile n’est pas configuré.

Les essais manuels sur appareils restent à consigner : épingler A puis B,
désépingler, terminer/rouvrir, passer entre comptes, utiliser une semaine future,
créer depuis son aperçu, puis ouvrir le même identifiant depuis les trois accès
et comparer les compteurs et montants. Vérifier aussi perte de réseau et texte
agrandi. Les tests automatisés ne remplacent pas ces essais iOS et Android.

L’[étape 14](SHOPPING_CLEANUP.md) a retiré les fichiers de l’ancien moteur après
audit des consommateurs. Les anciennes données restent conservées ; leur ancien parcours d’import a été retiré. La validation finale et les essais appareils restent à l’étape 15.

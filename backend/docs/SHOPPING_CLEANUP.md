# Retrait de l’ancien moteur local — étape 14

Étape réalisée dans le dépôt le 16 novembre 2026, après vérification de la
bascule des accès et des reprises. Aucun changement de contrat HTTP, de migration
ou de dépendance. Supabase reste à 0021, appliquée et vérifiée précédemment.

## Audit et retrait

Les écrans Accueil, Calendrier et Liste ouvrent les listes identifiées depuis
l’étape 13. La recherche des imports et consommateurs a confirmé que l’ancien
moteur n’était plus utilisé que par ses propres composants et ses anciens tests.
Les six fichiers retirés sont :

- `mobile/components/shoppingList.ts` : agrégation locale du calendrier,
  comparaison de prix de paquets et écritures des anciennes clés ;
- `mobile/components/useShoppingList.ts` : état et commandes de ce moteur ;
- `mobile/components/ShoppingListView.tsx` : ancienne vue Épicerie ;
- `mobile/components/ShoppingListStatus.tsx` : anciens statuts de cette vue ;
- `mobile/components/ArticleSheet.tsx` : ancienne fiche d’article ;
- `mobile/components/AddItemField.tsx` : ancien ajout rapide.

Les styles résiduels des anciennes tuiles d’Accueil et du compteur du Calendrier
ainsi qu’un faux hook dans les tests du Calendrier sont retirés. Les anciennes
références documentaires sont identifiées comme historiques, sans liens vers
ces fichiers supprimés.

Les fonctions de prix d’une offre dans `services/offerPricing.ts`, Promos,
les suivis et `useFollows` restent utilisés et sont conservés. Les calculs de
couverture, paquets, limites et budgets des listes restent côté backend. Les
outils décimaux de saisie et de présentation des courses ne sont pas un second
moteur de prix et restent nécessaires.

## Données et reprise conservées

Aucun effacement, renommage ou réécriture des données de téléphone n’accompagne
ce retrait de code. Les anciennes clés privées `shoppingList.manuels` et
`shoppingList.gardeManger` restent lisibles uniquement par la récupération
volontaire de l’étape 12. Les anciennes coches, possessions hebdomadaires,
préférences de produits et de magasin restent conservées sans être utilisées
comme achats ou prix actuels. Les clés communes sans propriétaire restent ignorées.

La récupération garde son aperçu, la sélection explicite des exclusions, ses
reçus par identité source et son journal idempotent. Son test de conservation
compare les anciennes valeurs avant et après une récupération complète, y
compris les clés communes, les suivis et les données du compte voisin. La purge
après suppression distante confirmée du compte conserve son comportement
explicite ; elle n’est pas exécutée par cette mise à jour.

## Validation

**252 tests mobiles réussis**, dont la récupération après retrait du moteur,
l’isolation du stockage, les suivis, les commandes, les courses, le cache et les
accès unifiés. Les tests exclusivement liés à l’ancien moteur et à sa vue sont
retirés ; les tests d’identité des suivis restent, et les contrôles du stockage
par compte utilisent directement le service actuel. Le nombre inférieur à
l’étape 13 correspond à ce retrait de tests devenus sans consommateur, pas à des
tests désactivés ou ignorés.

TypeScript, 46 exports de contrats, bundles Expo iOS/Android et documentation
stricte vérifiés. Aucun lint mobile n’est configuré.
Les essais appareils et la validation finale d’accessibilité restent à consigner
à l’étape 15 ; ce retrait ne constitue pas une confirmation iOS/Android manuelle.

Références : [accès unifiés](SHOPPING_ACCESS.md),
[récupération](SHOPPING_RECOVERY.md), [hors connexion](SHOPPING_OFFLINE.md),
[suivi complet](SHOPPING_LISTS.md).

# Récupération des anciennes données locales — étape 12

Étape livrée dans le dépôt le 16 novembre 2026. Le parcours est accessible par
**Liste → Récupérer mes anciennes données**. Aucun nouveau contrat HTTP,
aucune migration et aucune dépendance. La base distante n’a pas été modifiée ;
0020 reste à appliquer selon le dernier état consigné.

## Parcours utilisateur

1. Se connecter au compte propriétaire des anciennes données sur cet appareil.
2. Ouvrir la récupération et vérifier l’aperçu. Les articles ajoutés à la main
   sont sélectionnés par défaut, mais aucune commande n’est envoyée avant
   **Confirmer la récupération**. Chaque article peut être désélectionné.
3. Donner un nom au brouillon et une date de courses. Les anciens ajouts manuels
   ne contenaient pas de quantités : les besoins récupérés restent à préciser.
   Un ingrédient disparu est conservé comme article libre, avec son ancien nom.
4. Facultativement, sélectionner les anciens ingrédients « J’en ai toujours » à
   convertir en **Ne plus suggérer**. Ces cases sont toutes décochées au départ.
   Le texte précise leur portée : futures générations depuis le calendrier,
   sans changement des listes existantes, modèles ou possessions. Une récupération
   de préférences seules ne crée pas de liste vide.
5. Confirmer. Le réseau est nécessaire pour le catalogue et l’enregistrement.
   Le brouillon est créé, puis complété article par article ; les exclusions
   sélectionnées sont enregistrées ensuite. Une interruption peut donc laisser
   un brouillon partiel, signalé dans l’interface.
6. En cas d’interruption, rouvrir cet écran et choisir **Reprendre la récupération**.
   Nom, date, sélection, progression et commande incertaine restent enregistrés.
   Un brouillon partiel peut être ouvert séparément ; la reprise reprend son
   contenu confirmé sans écraser les changements déjà effectués.
7. Un élément explicitement refusé peut être ignoré pour continuer. Sa source
   reste récupérable. Une commande dont la réponse est incertaine ne peut pas
   être ignorée : son résultat doit d’abord être retrouvé par rejeu.

Les anciennes données ne sont ni supprimées ni réécrites. Les identités déjà
récupérées sont signalées et retirées des prochains aperçus. Les nouveaux ajouts
locaux peuvent faire l’objet d’une autre récupération volontaire.

## Données récupérables et limites

Seules les clés `shoppingList.manuels` et `shoppingList.gardeManger` de l’espace
`optimeal.accounts.v1.<compte>.` sont lues. Les anciennes clés communes, dont le
propriétaire est inconnu, ne sont jamais consultées ou attribuées. Les visiteurs
ne lisent aucune donnée privée ; chaque réponse et navigation est liée au
compte et au parcours d’origine.

Les anciennes coches, possessions hebdomadaires et préférences de produits ne
contiennent pas d’instantané fiable des besoins, formats et prix. Elles restent
conservées localement, sans devenir des achats, quantités disponibles, choix
actuels ou montants. Les besoins des repas se créent depuis l’aperçu du calendrier
existant ; aucune ancienne semaine n’est reconstruite avec les recettes actuelles.
L’ancien magasin préféré n’est pas appliqué comme une nouvelle comparaison.

Le catalogue paginé vérifie les identités d’ingrédients. Une préférence vers un
ancien ingrédient introuvable reste locale avec avertissement. Les articles
invalides ou partageant une identité ambiguë sont signalés, jamais fusionnés
par hypothèse. Une source illisible bloque l’aperçu ; plus de 500 articles ou
préférences bloque la récupération sans effacer les sources. Un changement
de source entre aperçu et confirmation exige un nouvel aperçu. Une récupération
commencée conserve au contraire la sélection déjà confirmée, même si l’ancien
parcours évolue ensuite.

Accueil et Calendrier utilisent toujours l’ancien moteur. Leur unification et
son retrait restent aux étapes 13–14. La récupération ne synchronise pas en
continu les anciennes données et les nouveaux brouillons.

## Reprise et absence de doublons

`mobile/services/shoppingRecovery.ts` conserve un journal privé versionné dans
`shopping-recovery.v1`. Il contient la sélection confirmée, la liste cible, sa
révision, les positions d’import et la commande en cours. Des reçus locaux par
identité source distinguent les articles et préférences déjà récupérés. Le
journal et les sources sont purgés avec les autres données locales après
suppression distante confirmée du compte.

Le journal est sauvegardé avant chaque envoi et l’acquittement est sauvegardé
avec le reçu de source. Une réponse perdue ou une panne de stockage après commit
réutilise exactement la clé idempotente, la méthode et le corps précédents.
Aucune nouvelle liste ou ligne n’est créée par le rejeu. Les opérations sont
sérialisées par compte, y compris les confirmations et reprises simultanées.

Les routes existantes sont utilisées : création de liste, ajout d’article et
exclusion cible `excluded=true`. Une révision distante différente provoque un
refus avant écriture ; la reprise relit la révision et crée une nouvelle clé
pour l’ajout encore non effectué, sans modifier les autres articles ou le nom
distant. Un ingrédient disparu entre aperçu et écriture peut être repris comme
article libre uniquement après un refus explicite `INGREDIENT_NOT_FOUND`.
Un réessai efface durablement l’ancien statut « refusé » avant son envoi, pour
ne jamais permettre d’ignorer une commande devenue incertaine.

## Validation

**261 tests mobiles réussis**, dont 25 nouveaux scénarios sur la récupération :
consentement, sélection facultative, isolation, clés communes ignorées, identité
ambiguë, source modifiée, réponses perdues dans les trois phases, redémarrage,
échec de stockage avant/après commit, ajout distant, ingrédient disparu,
confirmations concurrentes, refus, purge et réponse tardive après changement de
compte. TypeScript, bundles Expo iOS/Android, 44 exports de contrats et documentation
stricte vérifiés. Les contrats HTTP restent inchangés.
Aucun lint mobile n’est configuré.

Essais manuels iOS et Android à consigner : confirmer une sélection, refuser la
conversion des préférences, interrompre la connexion pendant l’ajout, fermer et
rouvrir, reprendre puis vérifier l’absence de doublons, passer sur un autre
compte, revenir et vérifier la conservation des anciennes données. Vérifier aussi
texte agrandi, lecteur d’écran et défilement d’un aperçu long.

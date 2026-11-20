# Création et enregistrement des listes

> **Note historique de réalisation.** Les sections datées ci-dessous décrivent
> les étapes et validations initiales. Pour les écrans actuels, consulter le
> [guide des listes](SHOPPING_GUIDE.md) et les [contrats courants](SHOPPING_LISTS_CONTRACTS.md).
> La tête Alembic est 0023, contrôlée sur la base configurée le 20 novembre 2026 ;
> les mentions de révisions antérieures ou d’absence de lint décrivent ces anciens essais.
> Le lint est désormais configuré ; voir le [guide mobile](../../mobile/README.md#vérifier-le-code-avec-eslint).

Après création, les produits et prix sont directement affichés. Une seule action
**Recalculer les prix** utilise le même calcul direct pour le complément après
modification, en conservant les achats déjà effectués. Voir le
[parcours de recalcul](SHOPPING_COMPARISONS.md).

## Création en deux étapes et prix directs — 16 novembre 2026

Ce parcours remplace la création en une étape décrite dans les notes précédentes.

1. **Ingrédients** : nom et date, saisie manuelle ou calendrier. Les quantités du
   calendrier se modifient directement ; les besoins peuvent être retirés et des
   articles ajoutés. **Suivant** calcule les prix sans enregistrer de brouillon.
2. **Prix par magasin** : Maxi, Metro, Super C, puis **Moins cher** en dernier.
   Toucher une carte affiche les produits exacts. Le panier Moins cher les
   regroupe par magasin. Toucher un produit ouvre les alternatives ; choisir un
   autre produit/magasin recalcule le panier Moins cher. Les totaux propres à une
   enseigne restent distincts de cette personnalisation. **Précédent** conserve
   les ingrédients et permet de corriger la saisie avant un nouveau calcul.
3. **Créer la liste** confirme le panier sélectionné et enregistre la liste active,
   ses besoins et ses prix ensemble. Il ne s’agit pas d’une troisième page.
   Aucun minuteur, cache de liste ou historique des versions n’est réintroduit.

### Calcul demandé

- Sans quantité : prix direct d’un produit. Avec quantité : nombre entier de
  produits arrondi au supérieur, puis coût de ces produits. Exemple : 750 g,
  format 500 g à 3 $ → 2 produits, total 6 $. Une quantité exactement divisible
  n’ajoute pas de produit. Les calculs utilisent des décimaux/fractions exacts.
- Les besoins d’un même ingrédient se regroupent avant l’arrondi et les limites
  promotionnelles. Plusieurs lignes sans quantité demandent chacune un produit.
- Le prix direct utilise le prix régulier ou la promotion valide à la date des
  courses, avec son prix après limite. Le moins cher minimise le total à acheter,
  et ne compare pas seulement les prix affichés d’un produit de chaque format.
- Le format doit correspondre à la dimension demandée pour convertir des g/ml.
  Un nombre de produits utilise l’unité de vente lorsque le format n’est pas
  exprimé en pièces. Aucun prix ou format absent n’est inventé : le besoin reste
  sans prix, et un panier incomplet exige une confirmation explicite.
- Le calcul direct conserve la source et son statut de vérification. Il ne
  transforme pas une référence sans attestation en référence vérifiée. Le moteur
  historique de couverture attestée reste distinct pour les autres parcours.

### API et persistance

`POST /api/v1/shopping-lists/creation-prices` est privé et sans écriture. Il reçoit
les ingrédients/quantités, la date et les choix par indice. Il retourne les quatre
scénarios, les produits alternatifs, leurs prix/nombres à acheter et une empreinte.
Un nom libre est relié au catalogue uniquement si son nom ou alias exact donne
une identité unique ; les noms inconnus restent sans prix.

Les créations manuelle/calendrier acceptent `pricing` (empreinte, scénario, choix,
confirmation d’un sous-total) ; le calendrier accepte aussi `adjusted_items`.
Le serveur relit le catalogue et recalcule les montants : aucun prix client n’est
accepté. Prix, besoins ou choix différents de l’empreinte → conflit et annulation
complète, sans liste partielle. La reprise idempotente ne relance pas le calcul.
Les achats produits conservent ces prix directs et couvrent aussi les besoins
sans quantité avec une confirmation liée au besoin courant ; une décoche annule
leur couverture et rétablit le montant restant.

Aucune migration ni dépendance supplémentaire. Le backend doit être déployé avec
le mobile pour les nouveaux contrats. Supabase n’est pas modifié par ce travail.


Validation du parcours en deux étapes : **981 tests backend réussis**, 14 essais
OCR opt-in ignorés ; **235 tests mobiles réussis**, TypeScript, 46 exports de
contrats, bundles Expo iOS/Android et documentation stricte vérifiés. PostgreSQL
local jetable uniquement ; serveur de test arrêté après les vérifications.
Aucun lint mobile configuré. Essais sur téléphones iOS/Android à consigner.

## Notes précédentes

## Création complète et retrait de la synchronisation — 16 novembre 2026

Cette décision remplace les anciennes descriptions de brouillons à compléter,
de cache hors connexion, de synchronisation et d’historique des versions.

- **+ Créer une liste** ouvre un formulaire : nom, date, origine et articles.
- Les articles sont ajoutés, modifiés ou retirés dans le formulaire sans écriture
  serveur. Une saisie d’article inachevée ou une liste vide bloque la validation.
- **Créer la liste** envoie le contenu complet en une seule transaction et ouvre
  une liste active. Le calendrier conserve son aperçu vérifié ; on peut retirer
  des besoins de cet aperçu et ajouter des articles avant de confirmer.
- Aucun rafraîchissement périodique, cache de listes ni file de synchronisation.
  Le chargement a lieu à l’ouverture ; chaque action explicite enregistre son
  résultat sur le serveur. Une panne apparaît comme une erreur, sans coche locale.
- L’historique des listes terminées/archivées reste disponible. Les anciennes
  versions d’une même liste ne sont plus sauvegardées ni consultables par API.
  L’écran et les routes de révisions sont retirés.
- Le compteur `revision` reste interne pour refuser les modifications concurrentes.
  La table technique `shopping_list_revision` conserve seulement l’état courant :
  chaque mutation remplace ses lignes dans la même transaction. Les anciennes
  lignes déjà présentes sont retirées à la prochaine mutation de cette liste.
- Les résultats de commandes idempotentes et la reprise **manuelle** d’une demande
  incertaine restent pour éviter un doublon après une réponse perdue ; ils ne
  constituent ni un historique consultable ni un envoi automatique en arrière-plan.

Aucune migration n’est nécessaire : la structure existante sert à l’état courant.
Le serveur doit être déployé avec le mobile pour accepter `items`, `activate` et,
pour le calendrier, `excluded_item_ids`. Les anciens clients/API qui omettent
`activate` gardent le contrat de création en brouillon. Aucune modification de
Supabase n’est exécutée pour ces ajustements.

## Vérifications

Création manuelle et calendrier atomiques, validation des ingrédients, quantités
normalisées, annulation intégrale après erreur, idempotence, refus de contenu
ancien et accès privés. Côté mobile : édition locale avant confirmation, requête
unique, liste vide/saisie inachevée bloquées et absence de contrôle périodique.
Les essais sur téléphones iOS et Android restent à consigner.


Validation du 16 novembre 2026 : **959 tests backend réussis**, 14 essais OCR
opt-in ignorés ; **225 tests mobiles réussis**, TypeScript, 44 exports de contrats,
bundles Expo iOS/Android et documentation stricte vérifiés. Tests PostgreSQL
exécutés uniquement sur une base locale jetable. Lint mobile non configuré.
Les essais sur téléphones restent à consigner.

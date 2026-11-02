# Notation des recettes

## État — 2 novembre 2026

La notation est intégrée à l’API et au mobile : trois critères, note pondérée,
classement ajusté avant pagination, versions évaluées et accès depuis Promos
et Calendrier. La suppression de compte retire aussi les anciens votes.

Les migrations **0011 à 0013 sont appliquées sur Supabase**. La révision
`0013_rating_versions` est confirmée après commit ; le schéma est conforme
aux modèles et les données préexistantes sont conservées.

La validation finale a réussi : 520 tests backend et 100 tests mobiles, aucun
ignoré, TypeScript, 11 exports de contrats, bundles iOS/Android et construction
stricte de la documentation. Les lectures de l’API sur Supabase renvoient 200.
Le lint mobile n’est pas configuré. Les tests automatisés utilisent les services
natifs et Auth simulés. Hamza confirme le 2 novembre 2026 que les tests sur
téléphone fonctionnent après les derniers ajustements ; la plateforme n’est
pas précisée.

Le [bilan de validation](RATINGS_VALIDATION.md) précise les contrôles et leurs
limites, ainsi que la confirmation globale sur téléphone, sans résultats
distincts iOS/Android.

## Formulaire « Noter cette recette »

Après ouverture du formulaire, afficher cette introduction :

> Après avoir préparé cette recette, partage ton expérience. Donne une note de 1 à 5 pour chaque critère : 1 est la note la plus basse, 5 la plus haute.

Afficher chaque critère, suivi de sa question puis directement des étoiles.
L’introduction est conservée ; les explications supplémentaires, les repères
par critère et les pondérations ne sont pas affichés dans le formulaire.

| Critère | Question |
| --- | --- |
| Goût | As-tu apprécié le résultat ? |
| Fiabilité | Les ingrédients et les étapes étaient-ils suffisamment complets pour obtenir le résultat annoncé ? |
| Facilité | La préparation était-elle facile à réaliser ? |

Les trois notes sont des entiers de 1 à 5, obligatoires dans une même
évaluation. Aucune note n’est présélectionnée lors d’une première saisie.
En modification, charger les trois notes déjà enregistrées.

La fiabilité exprime l’expérience rapportée par la personne ; elle ne garantit
pas la réussite de la recette. La facilité évaluée par la communauté reste
distincte de la difficulté Facile/Moyenne/Difficile renseignée par l’auteur.

Le formulaire proposera « Enregistrer mon évaluation » et « Annuler ».
Une évaluation existante proposera aussi « Supprimer mon évaluation », avec
confirmation. Annuler ne modifiera aucune donnée enregistrée. La soumission
attendra les trois notes et la confirmation du serveur avant d’afficher le
nouveau résultat ; une erreur conservera la saisie pour permettre de réessayer.

## Règles d’accès

- Tout le monde peut consulter les moyennes d’une recette publique.
- Un compte connecté peut noter une recette publique qui ne lui appartient pas,
  y compris une recette initiale d’OptiMeal.
- Chaque compte possède au plus une évaluation par version de recette ; il
  peut modifier sa note courante. Supprimer sa contribution retire toutes ses
  versions pour la recette, jamais celles d’un autre compte.
- Le backend vérifie l’identité, la visibilité et la propriété à chaque écriture.
- Une recette privée ne reçoit pas de nouvelles évaluations. Son retrait du
  public conserve les évaluations mais les masque aux autres comptes ; une
  republication les rend à nouveau consultables, sous réserve de leur version.
- La suppression d’une recette retire ses évaluations ; la suppression d’un
  compte retire les évaluations qu’il a données. Les agrégats sont actualisés.
- La préparation est déclarative : une ouverture, un favori ou un repas planifié
  ne prouve pas que la recette a été cuisinée.

## Contrôles d’accès et cas limites — étape 2

Les réponses backend ci-dessous sont implémentées et testées à l’étape 5 ;
les interactions du formulaire mobile sont intégrées à l’étape 6, avec tests
simulés. Les tests sur téléphone sont confirmés globalement par Hamza le
2 novembre 2026, sans détail par plateforme ni par cas limite.
Elles suivent les conventions d’erreur du
backend existant : enveloppe `error`, identité issue du jeton et ressource
privée inaccessible présentée comme introuvable.

### Consultation et identité

| Situation | Résultat attendu |
| --- | --- |
| Visiteur ouvrant une recette publique | Résumé des notes visible ; aucune évaluation personnelle ; action Noter proposant la connexion |
| Jeton fourni mais invalide ou expiré | 401 `AUTH_REQUIRED` ; ne pas traiter silencieusement le compte comme visiteur |
| Service de vérification Auth indisponible | 503 `AUTH_UNAVAILABLE` ; aucune écriture |
| Recette privée d’un autre compte, ou recette absente | 404 `RECIPE_NOT_FOUND` ; aucune moyenne ni note personnelle exposée |
| Propriétaire ouvrant sa recette privée | Peut consulter les agrégats conservés ; ne peut pas s’autoévaluer |
| Deux comptes ouvrant la même recette publique | Mêmes agrégats ; chaque compte reçoit uniquement ses propres trois notes dans `my_rating` |

Les réponses publiques n’exposent pas les identifiants des évaluateurs ni la
liste de leurs notes individuelles. `my_rating` vaut null en l’absence
d’évaluation du compte connecté. Aucun appel ne reçoit un `user_id` choisi
par le mobile pour déterminer l’évaluateur.

### Création et modification de sa note

Route disponible : `PUT /api/v1/recipes/{id}/rating`. Après succès, réponse 200
avec le résumé actualisé et les trois notes personnelles confirmées.

| Situation | Résultat attendu |
| --- | --- |
| Compte connecté, recette publique d’un autre auteur ou recette initiale | Créer l’évaluation pour la version courante si absente, sinon remplacer les trois notes du compte pour cette version |
| Visiteur avec un corps valide | 401 `AUTH_REQUIRED` ; aucune écriture |
| Auteur notant sa propre recette publique | 403 `SELF_RATING_FORBIDDEN` ; aucune écriture |
| Recette privée d’autrui ou absente | 404 `RECIPE_NOT_FOUND` ; aucune écriture |
| Recette privée du compte | 403 `SELF_RATING_FORBIDDEN` ; aucune écriture |
| Champ requis manquant, null, booléen, chaîne, décimal, note hors 1–5 ou champ inconnu | 422 `VALIDATION_ERROR` ; conserver intégralement l’ancienne évaluation |
| Moyenne, poids, identifiant utilisateur ou date envoyés dans le corps | 422 `VALIDATION_ERROR` ; ces valeurs sont contrôlées par le serveur |
| Même soumission répétée | Une seule évaluation et un effectif inchangé après la première création |
| Deux premières soumissions simultanées du même compte | Une seule ligne grâce à la contrainte unique ; les trois notes d’une soumission complète gagnent, sans mélange |
| Mise à jour par le compte B | Ne modifie jamais la ligne du compte A |
| Panne PostgreSQL | 503 `RECIPES_UNAVAILABLE` ; aucun succès annoncé |

Le corps contient `taste_score`, `reliability_score` et `ease_score`, tous
trois strictement entiers de 1 à 5, et `recipe_version`, entier strictement
positif obligatoire égal au `content_version` du détail. Une version différente
renvoie 409 `RECIPE_VERSION_CONFLICT`, sans enregistrer de vote. La sauvegarde des notes
est atomique. Une mise à jour conserve `created_at` et actualise `updated_at`.
Pour deux modifications concurrentes autorisées, la dernière écriture validée
gagne ; aucune fusion des critères n’est effectuée.

Sérialiser la vérification de visibilité et l’écriture avec les opérations de
publication, retrait et suppression de recette, en utilisant le même verrou de
recette que les services existants. Si le retrait est confirmé avant le
contrôle, rejeter le vote ; si le vote est enregistré avant le retrait, il est
conservé puis masqué. La contrainte unique protège aussi les créations
concurrentes ; une simple vérification préalable ne suffit pas.

### Retrait de sa note et cycle de vie

Route disponible : `DELETE /api/v1/recipes/{id}/rating`, réponse 204 sans corps.

| Situation | Résultat attendu |
| --- | --- |
| Compte connecté retirant sa note | Supprimer uniquement les évaluations de ce compte pour la recette, toutes versions comprises |
| Note déjà absente, ou suppression répétée | 204 ; l’opération est idempotente |
| Recette devenue privée ou supprimée | 204 ; permettre le retrait de sa propre contribution sans exposer l’existence ou le contenu de la recette |
| Visiteur | 401 `AUTH_REQUIRED` |
| Compte B envoyant le même identifiant de recette que A | Retirer seulement la note de B si elle existe ; ne jamais toucher à celle de A |
| Retrait du public puis republication sans changement de contenu évalué | Conserver les notes et restaurer leur prise en compte à la republication |
| Suppression d’une recette | Retirer ses évaluations par cascade ; conserver les repas devenus indisponibles selon le comportement actuel |
| Suppression d’un évaluateur | Retirer ses notes par cascade et les exclure des moyennes et effectifs suivants |

Le retrait de sa note reste permis après perte d’accès, comme le retrait actuel
d’un favori. Le futur mobile peut masquer le formulaire d’une recette devenue
inaccessible ; cette possibilité de suppression reste disponible côté API.
La suppression du compte permet également de retirer toutes ses contributions.

### Résultats et erreurs dans le mobile

- Après une première évaluation, incrémenter l’effectif une seule fois ; après
  modification, changer les moyennes sans augmenter l’effectif ; après retrait
  de la dernière note, revenir à « Pas encore évaluée » et aux moyennes null.
- Une création de recette, un favori, un ajout au calendrier et son marquage en
  restes ne créent jamais de note automatique.
- Annuler le formulaire ou la demande de connexion n’envoie aucune note.
- En cas de délai dépassé, conserver la saisie et indiquer que l’enregistrement
  n’a pas pu être confirmé. Une nouvelle soumission remplace la même note :
  elle ne crée pas un deuxième vote, même si la première requête avait réussi.
- Si le serveur renvoie 404 après retrait du public, fermer l’accès à la
  notation et actualiser la fiche. Ne pas afficher un succès local.
- Bloquer les doubles actions pendant une requête et effacer la saisie et les
  notes personnelles au changement de compte, conformément à la navigation.
- Après un conflit 409, fermer le formulaire, abandonner sa saisie et demander
  l’actualisation et la relecture de la recette avant une nouvelle notation.

### Validation prévue

Les tests d’API couvrent les erreurs sans mutation, l’isolation de deux
comptes, le remplacement et le retrait des votes, les agrégats et les pannes.
Les contraintes et cascades sont couvertes par les tests de stockage. Deux
tests PostgreSQL avec connexions distinctes vérifient la soumission simultanée
d’un premier vote et le retrait du public avant un vote en attente du verrou.
Ils nécessitent une base locale vide nommée `optimeal_test_…`, sans exécution
parallèle des autres tests sur cette même base. Les tests nettoient leurs
données et reviennent à une chaîne de migrations vide après exécution.
Les parcours de saisie et d’erreur du formulaire sont couverts par les tests
mobiles. Le [guide mobile](../../mobile/README.md#noter-une-recette) donne
les scénarios à reproduire sur appareil.

## Réponses disponibles — étape 5

`GET /api/v1/recipes` inclut `rating` dans chaque résumé. Le détail et la
réponse de `PUT /api/v1/recipes/{id}/rating` incluent aussi `my_rating`.
Les moyennes sont des chaînes décimales ou null ; `my_rating` contient les
trois notes entières et les horodatages, sans identifiant de compte. La liste
n’expose pas `my_rating` et le score de classement n’est jamais renvoyé.
Les contrats complets et les exemples sont dans [CONTRACTS.md](CONTRACTS.md#notation-des-recettes)
et les exports de `backend/contracts/v1/`.

## Calculs disponibles — étape 4

Le module `backend/app/recipes/ratings.py` fournit deux fonctions sans accès
à la base ni effet persistant :

- `summarize_ratings` reçoit l’effectif et les trois sommes entières des notes.
  Il renvoie les moyennes par critère, la moyenne pondérée réelle et le score
  de classement. Les services obtiennent désormais ces sommes par une
  agrégation SQL, sans charger tous les votes en mémoire.
- `ranking_score` calcule le score ajusté à partir d’une moyenne réelle et
  de son effectif. `reference_average` et `prior_weight` sont des paramètres
  du code serveur, avec les valeurs initiales 4,0 et 20 ; ils ne viennent
  jamais du formulaire. Leur configuration par environnement n’est pas ajoutée
  à cette étape.

Les calculs utilisent `Decimal`, avec une précision locale de 28 chiffres
significatifs. Ils ne sont pas arrondis à la précision d’affichage. La note
globale est calculée à partir des sommes pondérées avant division pour éviter
de réutiliser des moyennes par critère déjà arrondies.

Sans vote, les trois sommes doivent valoir zéro et toutes les moyennes ainsi
que le score de classement valent `None` (futur JSON `null`). Les paramètres
invalides et les sommes incohérentes sont refusés. Le score de référence
n’est pas présenté comme la note d’une recette non évaluée.

Ces fonctions reçoivent uniquement les votes admissibles : les services
filtrent les droits et la correspondance de version du contenu évalué.
Elles ne lisent ni ne révèlent de données privées. Les routes et l’agrégation
SQL sont branchées à l’étape 5. À l’étape 7, le tri SQL utilise directement la
somme pondérée et l’effectif, avec les mêmes constantes, avant pagination.

Vérification ciblée depuis la racine :

```bash
python -m pytest backend/tests/test_recipe_rating_calculations.py -q
```

Les 53 tests couvrent les exemples chiffrés, l’absence de votes, les poids,
l’effet de l’effectif, les paramètres de référence, la précision, les bornes,
les entrées invalides et le recalcul sur des agrégats modifiés ou vidés. Ils
ne nécessitent pas PostgreSQL et ne valident pas encore les mutations HTTP.

## Note publique et classement

Les trois notes brutes sont conservées en base. Le calcul backend de la note
publique suit la formule :

```text
R = 0,40 × moyenne Goût + 0,40 × moyenne Fiabilité + 0,20 × moyenne Facilité
```

Ces poids sont une hypothèse de conception à évaluer. Afficher la vraie note
pondérée avec le nombre d’évaluations complètes, par exemple
« ★ 4,5 · 28 évaluations ». Sans évaluation, la moyenne vaut null et l’interface
affiche « Pas encore évaluée ». Arrondir seulement pour l’affichage.

Le tri « Mieux notées » utilise un score distinct :

```text
S = (n × R + m × C) / (n + m)
n = nombre d’évaluations complètes admissibles
m = 20 ; C = 4,0 au démarrage (paramètres configurables à évaluer)
```

Ce score sert uniquement au tri avant pagination. Les recettes sans évaluation
restent visibles après les recettes évaluées dans ce tri. Un tri « Plus
récentes » permet aussi de découvrir les nouvelles recettes.

Découvrir et Favoris choisissent `top` par défaut, Mes recettes choisit
`updated`. Sans section explicite (`accessible`), l’ordre historique par ID
reste disponible aux autres consommateurs. Les égalités se départagent par
identifiant croissant. Dans les listes publiques, `newest` utilise la
publication, ou la création en base si elle manque ; dans Mes recettes,
`newest` utilise seulement la création. `updated` utilise la modification.
Les dates inconnues vont à la fin. La migration ne reconstitue pas les dates
anciennes ; les nouvelles insertions sont datées côté serveur. Un vote ne
rafraîchit pas la récence d’une recette.

Le mobile conserve un tri par section, réinitialise la page lors d’un
changement et recharge les notes au retour du détail. La recherche, Rapides
et Petit budget conservent leur fonctionnement. Les cartes affichent la vraie
note à une décimale et l’effectif, sans appel supplémentaire par carte.

## Contenu évalué et réévaluation — étape 8

Chaque recette expose `content_version`, initialisée à 1. Le backend
l’incrémente atomiquement lors d’un changement d’ingrédients (identité,
quantité, unité ou précision), d’étapes (texte ou ordre), de portions ou de
durées. Les noms, photos, descriptions, difficultés, étiquettes et statuts de
publication peuvent changer sans invalider les notes. Un réordonnancement des
ingrédients ou une autre écriture de la même quantité ne crée pas de version.

Les lignes historiques gardent leurs trois notes, dates et `recipe_version`.
Une réévaluation ajoute une ligne pour la nouvelle version ; une modification
du vote courant remplace uniquement cette ligne. Les moyennes, effectifs et
scores de tri excluent toutes les versions précédentes. Le détail renvoie
seulement la dernière évaluation du compte dans `my_rating`, éventuellement
ancienne ; les autres notes individuelles ne sont pas exposées.

Le panneau affiche « Réévaluer la recette » si la dernière note personnelle
porte sur une autre version. Il identifie les anciennes notes et ouvre une
saisie vide. L’éditeur avertit de l’effet d’un changement de contenu sur les
notes. Supprimer sa contribution retire toutes ses versions après confirmation.
Un vote en attente pendant une édition ne peut pas être rattaché implicitement
au nouveau contenu : il reçoit 409, puis le mobile propose d’actualiser et de
relire la recette sans resoumission automatique.

Ce mécanisme archive les votes avec un numéro de contenu, sans sauvegarder les
anciennes recettes complètes. Les instantanés historiques des plans restent
un chantier distinct. Voir [MIGRATIONS.md](MIGRATIONS.md#versions-des-évaluations).

## Liens avec les autres onglets — étape 9

- Promos affiche la moyenne et l’effectif courants à partir des détails déjà
  chargés pour les ingrédients. Aucun appel de notation supplémentaire par
  carte ; le classement reste par nombre d’ingrédients en promotion. La carte
  ouvre le détail de Recettes et le retour recharge les notes. Une recette
  devenue inaccessible (404) pendant ce chargement est ignorée ; une panne
  reste une erreur, jamais une absence d’offres ou de recettes.
- Calendrier propose « Voir la recette » pour un repas
  dont la recette est accessible. Il ouvre la même fiche ; les notes libres
  et recettes indisponibles ne proposent pas cette action. Aucune note n’est
  créée par une action de planification. Les permissions et versions sont
  vérifiées dans le détail et dans les routes de notation existantes.
- Paramètres réutilise la suppression du compte : les cascades existantes
  retirent ses votes courants et historiques, ainsi que les votes liés à ses
  recettes supprimées. Le test d’intégration passe par DELETE /me, avec
  fournisseurs simulés et PostgreSQL local. Il vérifie la conservation des
  autres comptes, recettes et votes, le recalcul des agrégats et le repas
  d’autrui devenu indisponible.

## Suite de l’intégration

1. Règles de notation et textes : définis dans ce guide.
2. Droits et cas limites : scénarios et résultats attendus définis ci-dessus.
3. Persistance : modèle et migration ajoutés ; clé composée recette/compte,
   notes obligatoires de 1 à 5, horodatages et cascades. Voir [MIGRATIONS.md](MIGRATIONS.md).
4. Calculs : moyennes et score ajusté implémentés, testés et reliés aux
   services et au tri des listes.
5. Contrats : routes de notation, agrégats SQL, résumés des recettes et types
   mobiles implémentés ; exports OpenAPI, schémas et exemples actualisés.
6. Mobile : formulaire intégré au détail avec critères, questions et étoiles,
   moyennes, modification, suppression et gestion des erreurs. Tests simulés
   et bundles vérifiés ; tests sur téléphone confirmés globalement par Hamza.
7. Listes : note sur les cartes et tris SQL avant pagination intégrés ; dates
   ajoutées par la migration `0012`, sans date historique inventée.
8. Versions : archive des votes par contenu, filtrage des notes courantes,
   conflits 409 et parcours de réévaluation intégrés et testés.
9. Autres onglets : cartes Promos, accès aux évaluations depuis Calendrier et
   nettoyage du compte avec votes historiques intégrés et testés.
10. Validation : tests métier, contrats et parcours iOS/Android.
11. Documentation et évaluation des paramètres.
12. Livraison progressive des incréments prévus.

Les commentaires écrits et un nouvel onglet Avis ne font pas partie de cette
première intégration. Le filtre Petit budget et le classement actuel de
« Cuisiner avec les promos » conservent leurs responsabilités existantes.

# Supabase Auth — mise en place et vérification

Les photos des recettes personnelles, obligatoires à la création, utilisent aussi la session
Supabase, avec des écritures Storage limitées au dossier de leur propriétaire.
Voir le [guide des photos](RECIPE_IMAGES.md) pour leur configuration et la
lecture publique retenue pour le prototype.

Supabase gère les inscriptions, mots de passe, confirmations et sessions.
Le mobile utilise `@supabase/supabase-js`. FastAPI reçoit un access token
Bearer et le vérifie à chaque requête authentifiée avec
`GET /auth/v1/user`, via HTTPX déjà installé. Aucun décodage JWT non vérifié,
mot de passe local ou service role key n’est nécessaire.

## 1. Configuration du projet

Dans Supabase Authentication, les paramètres publics du projet ont été
vérifiés : Email et inscriptions activés, confirmation d’adresse requise,
connexion anonyme désactivée. Cette lecture ne crée ni ne modifie de compte.

`backend/.env` accepte `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY`.
En leur absence, les noms `EXPO_PUBLIC_SUPABASE_URL` et
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` sont aussi acceptés. Les variables
canoniques prévalent si les deux formes sont présentes. Ne jamais placer
`DATABASE_URL` ou une clé secrète dans `mobile/.env`.

## 2. Migration et profil

```bash
python -m alembic -c backend/alembic.ini upgrade head
python -m alembic -c backend/alembic.ini check
```

La révision `0003_accounts` ajoute :

- `profile.id UUID`, référence à `auth.users.id`, nom affiché et date de création ;
- `recipe.owner_id`, référence au profil, et `seed_key` nullable pour les créations personnelles ;
- `favorite`, clé composée utilisateur–recette, sans doublons.

La migration ne crée ni ne modifie `auth.users`. Les dix recettes initiales
gardent leur `seed_key` et un propriétaire nul : elles sont partagées en
lecture. Une recette personnelle exige un propriétaire et n’a pas de
`seed_key`. Le profil est créé à la demande après validation de l’identité,
lors de la lecture du profil, de sa mise à jour ou d’une première écriture.

Les tables applicatives conservent RLS activée sans politique d’accès direct
depuis le mobile. FastAPI utilise sa connexion PostgreSQL serveur et vérifie
explicitement les droits ; le rôle PostgreSQL doit disposer des droits requis.
Supprimer un compte Auth supprime son profil, ses recettes et ses favoris.
La conservation d’un futur historique nécessitera une décision et une migration.

Un retour de migration est refusé si des recettes personnelles existent,
pour éviter de les transformer en données partagées ou de les perdre.

## 3. Routes et droits

| Route | Connexion | Comportement |
| --- | --- | --- |
| `GET /auth/me` | Requise | UUID et courriel vérifiés par Supabase, sans accès DB métier |
| `GET /api/v1/me` | Requise | Profil personnel, créé si absent |
| `PATCH /api/v1/me` | Requise | Modifier seulement son nom affiché |
| `DELETE /api/v1/me` | Requise | Supprimer définitivement le compte connecté, après confirmation |
| `GET /api/v1/recipes` | Facultative | Recettes publiques, plus les recettes privées du compte connecté ; sections via `scope` |
| `GET /api/v1/recipes/{id}` | Facultative | Recette publique ou personnelle du compte courant |
| `POST /api/v1/recipes` | Requise | Créer une recette manuelle, propriétaire déduit du jeton |
| `PUT /api/v1/recipes/{id}` | Requise | Remplacer sa propre recette et ses ingrédients atomiquement |
| `PATCH /api/v1/recipes/{id}/visibility` | Requise | Publier ou rendre privée sa propre recette |
| `DELETE /api/v1/recipes/{id}` | Requise | Supprimer sa propre recette et ses liens/favoris |
| `PUT /api/v1/recipes/{id}/favorite` | Requise | Ajouter un favori accessible, de façon idempotente |
| `DELETE /api/v1/recipes/{id}/favorite` | Requise | Retirer son favori, de façon idempotente |

`favorites=true` filtre les favoris du compte connecté et exige une session.
Les résultats ajoutent `is_owned`, `is_favorite`, `visibility` et `published_at`.
Une recette privée appartenant à un autre compte renvoie 404. Une recette
publique d’autrui est consultable, mais toute modification, suppression ou
publication reste refusée (404). Les recettes initiales ne sont pas modifiables
par ces routes. Les recettes personnelles sont privées par défaut ; une
publication est volontaire. Les sections `mine` et `favorites` exigent une
session ; `discover` montre uniquement les recettes publiques. Voir les
[contrats](CONTRACTS.md#visibilité-et-sections-de-recettes--étape-backend).

La création utilise `RecipeCreate` et exige une URL de photo HTTPS valide
et non vide. La modification utilise `RecipeWrite`, qui conserve l’image
nullable pour les recettes existantes. Les deux contrats contiennent nom,
description, portions, durées, ingrédients, étapes, difficulté et étiquettes. Ils n’acceptent aucun
`owner_id`, `user_id`, `seed_key` ou identifiant choisi par le client.
Les identifiants `recipe_…` sont créés par le serveur. Les unités restent
`g`, `ml` et `unit`, avec des quantités décimales en chaînes et des étapes 1..N.
La création renvoie 201 ; suppression et favoris renvoient 204.

Sans jeton requis, avec un jeton invalide ou une adresse non confirmée : 401.
Une panne de Supabase Auth renvoie 503, distincte d’un refus de connexion.
Un jeton fourni mais invalide est refusé même sur une lecture facultativement
authentifiée. Les messages ne contiennent ni jeton, ni clé, ni détail du pilote.
Les routes historiques gardent leur enveloppe d’erreur ; `/api/v1/` utilise
le format d’erreur commun.

### Suppression définitive du compte

Dans Paramètres, « Supprimer mon compte » ouvre une confirmation. L’utilisateur
saisit exactement `SUPPRIMER`, puis confirme. Le mobile appelle :

```http
DELETE /api/v1/me
Authorization: Bearer <jeton du compte>
Content-Type: application/json

{"confirmation":"SUPPRIMER"}
```

Le serveur déduit l’identité du jeton validé et refuse tout champ supplémentaire,
notamment un identifiant d’un autre utilisateur. Il exige `SUPABASE_URL` et
`SUPABASE_SECRET_KEY` dans sa configuration ; la clé privilégiée ne va jamais
dans le mobile. Les nouvelles clés `sb_secret_` sont envoyées dans `apikey`,
sans les employer comme jetons JWT. La clé historique `service_role` reste
acceptée dans cette variable côté serveur.

Le traitement liste les fichiers du dossier `users/<id>/` dans le bucket
`recipes-images`, y compris les photos devenues inutilisées et les sous-dossiers,
puis les supprime par lots. Il demande ensuite la suppression définitive du
compte par l’API administrative Auth. Les clés étrangères existantes de la
migration `0003_accounts` suppriment le profil, les recettes personnelles,
leurs ingrédients, les favoris et les repas planifiés par cascade. Les recettes initiales, les
données des autres comptes et les circulaires restent intactes. Aucune
migration supplémentaire n’est nécessaire.

Une réussite renvoie **204 sans corps**. Le mobile retire la session locale,
y compris si la déconnexion distante échoue, et revient à l’accueil visiteur.
Le backend vérifiant les jetons auprès d’Auth à chaque demande, un compte
supprimé ne peut plus accéder aux ressources privées via FastAPI.

Sans connexion : **401**. Sans confirmation exacte ou avec un champ interdit :
**422**. Configuration manquante ou panne fournisseur : **503**, avec un message
sanitisé. Storage et Auth ne partagent pas de transaction : des photos peuvent
avoir été retirées avant un échec Auth. Le mobile signale cette possibilité
avant confirmation et conserve la session en cas de refus ou d’échec de la
requête. Une nouvelle tentative nettoie ce qui reste. Après une coupure ou un
délai dépassé, le résultat peut être incertain ; si la connexion est refusée,
le compte peut déjà avoir été supprimé. Les copies déjà mises en cache de photos
publiques peuvent subsister jusqu’à expiration du cache.

Les tests simulent les API fournisseurs ; le test de cascade utilise une base
PostgreSQL locale jetable lorsqu’elle est configurée. Aucun test ordinaire ne
supprime un compte dans le projet Supabase distant. Valider le parcours réel
avec un compte de test dédié, après confirmation dans l’application.

Références : [suppression administrative](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser)
et [gestion des données utilisateur](https://supabase.com/docs/guides/auth/managing-user-data).

## 4. Mobile et confirmation du courriel

Voir le [guide mobile](../../mobile/README.md) pour le lancement, les URL de
redirection et les vérifications sur téléphone. La session est persistée
par AsyncStorage et renouvelée automatiquement au premier plan ; les accès
métier utilisent FastAPI, avec un accès direct à Storage pour les photos
de recettes sous les politiques du propriétaire. React Navigation conserve les cinq
onglets prévus. Les comptes, Recettes, Promos et le calendrier sont intégrés ; les instantanés
historiques et les listes restent à développer. Les éléments retenus de Figma sont repris progressivement.

Le mobile propose aussi un mode visiteur : les lectures publiques sont
accessibles sans compte, tandis que l’ajout de recettes, les favoris et le
profil demandent une connexion. Les écrans personnels sont protégés dans
la navigation ; les contrôles d’identité et de propriétaire restent appliqués
par le backend. La déconnexion réinitialise les écrans et revient à l’accueil
visiteur. Le calendrier demande une connexion avant de charger les repas privés ; voir
[PLANNING.md](PLANNING.md).

## 5. Vérifications réalisées et limites

Les tests utilisent un transport Auth simulé et deux utilisateurs dans un
PostgreSQL local jetable. Ils couvrent la validation distante par jeton,
les erreurs 401/503, les profils, la visibilité, les mutations interdites,
les favoris privés et le rejet d’un propriétaire injecté. Le schéma `auth`
minimal de test est créé uniquement dans la base locale de test ; aucune
table Auth n’est créée par les migrations applicatives.

Les bundles iOS/Android et la vérification TypeScript ont été validés. Le
20 octobre 2026, Hamza a également confirmé les essais sur iPhone : inscription
réelle, courriel de confirmation et retour dans l’application, profil,
restauration de session, catalogue, recherche, Rapides, CRUD manuel et favoris.
Le passage entre deux comptes a confirmé la séparation des recettes privées
et des favoris ; les recettes initiales ne proposent pas de mutation dans
l’interface. La redirection native `optimeal://auth/callback` est autorisée.

Le 27 octobre 2026, Hamza a confirmé les parcours comptes, recettes, photos
et Promos sur iOS et Android, avec des essais Android par son coéquipier.
Ces essais mobiles complètent les tests d’autorisation côté API. Les scénarios
d’erreur complémentaires restent à effectuer. L’expiration réelle d’une session et son renouvellement ne sont
pas établis par le seul essai de fermeture/réouverture de l’application.

Le 21 octobre, l’ajout d’une photo de galerie à une recette personnelle a
également été confirmé sur téléphone. Les politiques Storage ont été testées
avec deux identités dans PostgreSQL local et appliquées au bucket existant.
La lecture publique des photos est un choix du prototype, distinct de la
visibilité privée des recettes dans FastAPI. Le parcours photo est également confirmé sur les deux plateformes au
27 octobre ; les essais d’erreur réseau restent à compléter. Voir
[RECIPE_IMAGES.md](RECIPE_IMAGES.md).

Le 1er novembre 2026, Hamza a confirmé le fonctionnement sur iOS du mode visiteur, de la connexion à la demande, de la photo obligatoire à la création, des photos de produits dans Promos et de la suppression du compte. Cette confirmation générale ne constitue pas un résultat individuel pour chaque scénario d’erreur. Les nouveaux parcours restent à reproduire sur Android.

Sources : [Supabase React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native),
[validation des JWT](https://supabase.com/docs/guides/auth/jwts),
[profils utilisateur](https://supabase.com/docs/guides/auth/managing-user-data),
[liens mobiles](https://supabase.com/docs/guides/auth/native-mobile-deep-linking).

*Dernière mise à jour : 1er novembre 2026*

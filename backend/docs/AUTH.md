# Supabase Auth — mise en place et vérification

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
| `GET /api/v1/recipes` | Facultative | Recettes initiales, plus les recettes du compte connecté |
| `GET /api/v1/recipes/{id}` | Facultative | Recette partagée ou personnelle du compte courant |
| `POST /api/v1/recipes` | Requise | Créer une recette manuelle, propriétaire déduit du jeton |
| `PUT /api/v1/recipes/{id}` | Requise | Remplacer sa propre recette et ses ingrédients atomiquement |
| `DELETE /api/v1/recipes/{id}` | Requise | Supprimer sa propre recette et ses liens/favoris |
| `PUT /api/v1/recipes/{id}/favorite` | Requise | Ajouter un favori accessible, de façon idempotente |
| `DELETE /api/v1/recipes/{id}/favorite` | Requise | Retirer son favori, de façon idempotente |

`favorites=true` filtre les favoris du compte connecté et exige une session.
Les résultats ajoutent `is_owned` et `is_favorite`. Une recette personnelle
appartenant à un autre compte renvoie 404, même pour une mutation. Les recettes
initiales ne sont pas modifiables par ces routes.

Le corps de création/modification est `RecipeWrite` : nom, description,
portions, durées, image nullable, ingrédients et étapes. Il n’accepte aucun
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

## 4. Mobile et confirmation du courriel

Voir le [guide mobile](../../mobile/README.md) pour le lancement, les URL de
redirection et les vérifications sur téléphone. La session est persistée
par AsyncStorage et renouvelée automatiquement au premier plan ; les accès
métier utilisent uniquement FastAPI. React Navigation conserve les cinq
onglets prévus ; seuls le socle Recettes et le compte sont implémentés.
Les écrans ne prétendent pas reproduire la maquette Figma à ce stade.

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

Ces essais mobiles complètent les tests d’autorisation côté API. Les essais
interactifs Android et les scénarios d’erreur complémentaires restent à
effectuer. L’expiration réelle d’une session et son renouvellement ne sont
pas établis par le seul essai de fermeture/réouverture de l’application.

Sources : [Supabase React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native),
[validation des JWT](https://supabase.com/docs/guides/auth/jwts),
[profils utilisateur](https://supabase.com/docs/guides/auth/managing-user-data),
[liens mobiles](https://supabase.com/docs/guides/auth/native-mobile-deep-linking).

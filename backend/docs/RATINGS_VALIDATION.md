# Validation de la notation — 2 novembre 2026

## Supabase

Le projet configuré pour PostgreSQL a été vérifié comme correspondant au
Supabase du backend et du mobile. Sa révision est passée de
`0010_preserve_meals` à **`0013_rating_versions`** par Alembic, dans une
transaction unique. Une nouvelle connexion confirme la tête après commit.

Les migrations `0011`, `0012` et `0013` sont appliquées. `alembic check`
ne détecte aucune différence entre le schéma et les modèles. La table
`recipe_rating` a sa clé recette/compte/version, ses clés étrangères en
cascade et RLS activée sans politique d’accès direct au client.

Les comptages et empreintes des colonnes préexistantes sont identiques avant
et après migration. Aucune recette, aucun profil ni repas existant n’a été
modifié par cette opération.

| Table préexistante | Avant | Après |
| --- | ---: | ---: |
| ingredient | 31 | 31 |
| recipe | 11 | 11 |
| recipe_ingredient | 61 | 61 |
| profile | 2 | 2 |
| favorite | 3 | 3 |
| category | 8 | 8 |
| product_offer | 93 | 93 |
| circular | 3 | 3 |
| meal_plan_entry | 12 | 12 |

La nouvelle table des évaluations est vide après migration. Les recettes
existantes commencent à la version de contenu 1 ; leurs dates de création et
modification restent inconnues, sans date historique inventée.

## Vérifications

| Contrôle | Résultat |
| --- | --- |
| Tests backend sur PostgreSQL 18 local jetable | 520 réussis, aucun ignoré |
| Tests mobiles avec services natifs simulés | 100 réussis, aucun ignoré |
| Vérification TypeScript | Réussie |
| Exports OpenAPI, JSON Schema et exemples | 11 cohérents |
| Bundles iOS et Android avec Node 22.23.3 | Générés |
| Construction stricte du site de documentation | Réussie, sans problème signalé |
| Schéma Supabase après migration | Conforme aux modèles |
| Lectures de l’API avec la configuration Supabase réelle | HTTP 200 |
| Tests sur téléphone | Réussis selon confirmation globale de Hamza le 2 novembre 2026 ; plateforme non précisée |

Les lectures ont été exécutées avec FastAPI dans un client de test en processus,
connecté aux services configurés : `/health`, `/health/db`, ingrédients, offres,
circulaires, recettes publiques triées par notes ou récence, et détail d’une
recette avec résumé des notes et version. Elles valident la configuration et
les données distantes ; elles ne vérifient pas la connexion Wi-Fi du téléphone
au serveur de développement.

Les écritures de notation, autorisations, versions, concurrence et suppressions
ont été vérifiées sur la base locale jetable avec Auth simulé. Aucun compte
ni vote de test n’a été ajouté ou supprimé dans Supabase lors de cette validation.

Les dépendances émettent des avertissements de dépréciation FastAPI/Starlette
et PyMuPDF ; aucun test n’échoue. Le lint mobile n’est pas configuré. Les
vérifications sur appareil et la connexion réelle aux comptes restent distinctes.

## Trois scénarios sur téléphone

Les essais sur téléphone portent sur trois parcours : noter et modifier, réévaluer après changement de contenu,
puis vérifier les autres onglets, les erreurs réseau et le retrait du vote.
Hamza confirme le 2 novembre 2026 que les tests sur téléphone fonctionnent
après les derniers ajustements de l’interface. Il s’agit d’une confirmation
globale ; aucun modèle, plateforme ou résultat individuel par étape n’a été
précisé.

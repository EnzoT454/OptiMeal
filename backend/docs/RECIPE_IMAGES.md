# Photos des recettes — prototype

Les dix illustrations initiales et les photos personnelles utilisent le bucket
public Supabase Storage `recipes-images`. Le champ `recipe.image_url`, déjà
présent, conserve l’URL publique. Les recettes restent accessibles selon les
droits FastAPI ; une photo est lisible par toute personne qui possède son URL.
Les reçus ne doivent pas être ajoutés à ce bucket.

## Configuration

Le bucket public doit exister. Depuis la racine, avec la connexion serveur
`DATABASE_URL` configurée dans `backend/.env` :

```bash
./.venv/bin/python -m backend.cli.configure_recipe_images
```

La commande applique transactionnellement et de manière rejouable
`backend/config/storage/recipe_images.sql` au service Storage existant.
Elle ne crée ni ne modifie les tables applicatives : leur schéma continue
d’être géré uniquement par Alembic. Elle fixe une limite de 5 Mo (ou conserve
une limite existante plus basse) et accepte JPEG, PNG et WebP, afin de conserver
les illustrations initiales en PNG.

Les trois politiques `optimeal_recipe_images_*` autorisent les comptes
authentifiés à insérer, lister et supprimer leurs propres fichiers sous
`users/<auth.uid()>/`. Les nouveaux envois de l’application sont des JPEG
avec un nom unique. Aucune politique UPDATE n’est ouverte : remplacer une
photo crée un fichier différent. Les fichiers initiaux à la racine du bucket
ne sont pas modifiables par ces comptes. Une politique permissive ajoutée
manuellement peut élargir ces droits ; les politiques doivent être revues
ensemble lors d’une évolution du bucket.

## Parcours

Le mobile utilise la clé publique et le jeton de session pour envoyer les
octets à l’API Storage ; aucune clé administrative n’est distribuée. L’envoi
est limité à 30 secondes. Il n’a lieu qu’après validation du formulaire.
FastAPI enregistre ensuite l’URL avec les autres champs de la recette.
Les formats HTTP et le schéma PostgreSQL des recettes restent identiques.

Le formulaire conserve la photo locale en cas d’échec de l’envoi. Si seule
la sauvegarde FastAPI échoue, il conserve l’URL déjà obtenue pour réessayer.
Le retrait d’une photo met `image_url` à `null` ; il ne supprime pas le fichier
Storage. Les remplacements, suppressions de recettes et formulaires abandonnés
après envoi peuvent laisser des fichiers inutilisés. Leur nettoyage reste
à développer ; aucun fichier n’est supprimé automatiquement après une erreur
réseau dont le résultat d’enregistrement est incertain.

## Vérification

`backend/tests/test_recipe_image_storage.py` teste les politiques avec deux
identités sur des tables Storage simulées dans PostgreSQL local jetable :
insertion dans son dossier, refus du dossier d’autrui, refus d’écrasement,
préservation des fichiers initiaux et rejeu de la configuration.
Les 291 tests backend sur PostgreSQL local, les 7 tests du service photo,
TypeScript et les bundles iOS/Android ont été vérifiés le 21 octobre 2026.
Les politiques et limites du bucket ont été appliquées puis relues sur
Supabase. Hamza a confirmé l’ajout d’une photo depuis la galerie sur téléphone
après recompilation. Les essais complémentaires de remplacement, retrait,
annulation, erreur réseau et le parcours Android restent à confirmer selon
le [guide mobile](../../mobile/README.md).

# Mobile OptiMeal

Socle Expo/TypeScript avec React Navigation : inscription, confirmation de
courriel, connexion, restauration et renouvellement de session, déconnexion,
profil minimal et recettes manuelles avec photo facultative depuis la galerie.
Les cinq onglets sont présents : Accueil, Promos, Recettes, Calendrier et
Paramètres. Promos permet de consulter les offres, les circulaires et les
recettes associées aux ingrédients en promotion. Calendrier reste à développer.
Les parcours comptes, recettes, photos et Promos sont confirmés sur iOS et
Android au 27 octobre 2026. Aucune fonction IA n’est intégrée.

## 1. Installer

Depuis `mobile/` :

```bash
npm ci
npm run typecheck
```

Le SDK Expo 58 demande Node 22.13+ compatible. Un Node 22 local est installé
en dépendance de développement : les scripts `npm run …` l’utilisent sans
modifier l’installation globale. `.nvmrc` indique également la version majeure.
Le fichier `package-lock.json` fixe les dépendances. Pour installer avec Node
22 dès le départ, sélectionner cette version dans votre gestionnaire Node.

## 2. Configurer les seules valeurs publiques

Copier `.env.example` en `.env`, puis renseigner :

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_EXAMPLE
EXPO_PUBLIC_API_URL=http://localhost:8001
```

Dans l’environnement local initial, les deux valeurs publiques ont été
copiées depuis `backend/.env`. Aucun mot de passe PostgreSQL ni clé secrète
n’est copié. Les `.env` sont ignorés par Git ; chaque développeur configure
le sien. Redémarrer Expo après une modification.

L’adresse FastAPI dépend de l’appareil :

| Environnement | Adresse du backend |
| --- | --- |
| Simulateur iOS sur ce Mac | `http://localhost:8001` |
| Émulateur Android standard | `http://10.0.2.2:8001` |
| Téléphone sur le même Wi-Fi | `http://IP_LOCALE_DU_MAC:8001` |

Depuis la racine, dans un autre terminal avec Python activé :

```bash
python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8001
```

Les migrations et imports décrits dans le [guide backend](../backend/docs/MIGRATIONS.md)
doivent être appliqués. Les appels privés envoient le jeton courant à FastAPI.
Une réponse 401 provoque au maximum une tentative de renouvellement avant
retour d’une erreur ; une panne réseau garde les données non enregistrées
dans le formulaire pour permettre une nouvelle tentative.

Pour un téléphone, connecter les deux appareils au même Wi-Fi et utiliser
l’IP locale du Mac, obtenue avec `ipconfig getifaddr en0` ou dans les réglages
Wi-Fi. Ouvrir `http://IP_LOCALE_DU_MAC:8001/health` dans le navigateur du
téléphone : la réponse attendue est `{"status":"ok"}`. `localhost` sur le
téléphone désigne le téléphone, pas le Mac. L’IP peut changer entre deux réseaux.

## 3. Autoriser la redirection dans Supabase

Dans **Authentication → URL Configuration → Redirect URLs**, ajouter :

- `optimeal://auth/callback` pour une application native installée avec ce schéma ;
- pour Expo Go local, l’URL correspondant à votre serveur Expo, par exemple
  `exp://IP_LOCALE_DU_MAC:8081/--/auth/callback`.

L’inscription fournit `Linking.createURL('auth/callback')` à Supabase. Le
retour utilise PKCE : ouvrir le lien sur le même appareil qui a commencé
l’inscription. Le schéma `optimeal` est déclaré dans `app.json` ; un changement
de schéma exige une nouvelle compilation native. Si le lien a confirmé
l’adresse sur un autre appareil, revenir à l’écran Connexion et se connecter
manuellement. L’application ne modifie pas les réglages du Dashboard.

Les réglages vérifiés sont Email activé, inscriptions autorisées, confirmation
requise et utilisateurs anonymes désactivés. Le service email intégré peut
limiter les envois : les erreurs sont affichées sans prétendre que l’inscription
est terminée.

## 4. Lancer et essayer

Le parcours validé utilise une compilation de développement native, avec
`expo-dev-client`, déjà déclaré dans les dépendances. Pour la première
installation sur un téléphone connecté par USB, depuis `mobile/`, choisir
une seule commande selon la plateforme :

```bash
npm run ios -- --device
```

```bash
npm run android -- --device
```

La compilation iOS nécessite Xcode et une configuration de signature ;
l’iPhone doit autoriser le Mac et le mode Développeur. La compilation Android
nécessite Android Studio et son SDK, avec le débogage USB autorisé sur le
téléphone. Ces commandes compilent, installent et lancent le serveur Expo.

Aux lancements suivants, garder FastAPI dans son terminal et lancer Expo
depuis `mobile/` :

```bash
npm start -- --dev-client
```

Scanner le QR code avec le téléphone pour ouvrir l’application installée.
Expo Go demande une version compatible avec le SDK 58 et ne constitue pas
le parcours validé ici. Le lien `optimeal://auth/callback` correspond à
l’application native installée.

Après une modification de `.env`, arrêter Expo avec Ctrl+C puis relancer :

```bash
npm start -- --dev-client --clear
```

Si le port 8081 est occupé, accepter 8082 et scanner le nouveau QR code.
Ces ports servent Expo ; `EXPO_PUBLIC_API_URL` garde le port **8001** de
FastAPI. Les modifications natives nécessitent une nouvelle compilation.

1. Créer un compte avec votre adresse et confirmer le courriel reçu.
2. Se connecter ; vérifier Paramètres et enregistrer un nom affiché.
3. Fermer puis rouvrir l’application : la session doit être restaurée.
4. Ouvrir Recettes, rechercher, filtrer Rapides, puis consulter un détail.
5. Créer une recette manuelle avec les ingrédients communs, la modifier,
   puis vérifier l’ajout et le retrait des favoris. La conserver pour la suite.
6. Vérifier qu’une recette initiale ne propose ni modification ni suppression.
7. Ajouter sa recette aux favoris, se déconnecter et se connecter avec un autre compte : aucune recette
   personnelle ni aucun favori du premier compte ne doit apparaître.
8. Revenir au premier compte, retrouver ses données puis tester l’annulation
   et la confirmation de suppression de sa recette personnelle.

La confirmation du courriel peut ouvrir directement une session : revenir
à l’écran Connexion n’est alors pas nécessaire. Pour la suppression,
vérifier d’abord l’annulation, puis confirmer et vérifier que la recette
disparaît aussi des favoris. Pour tester la séparation des comptes, conserver
une recette et un favori du premier compte jusqu’à sa reconnexion.

Les recettes initiales sont partagées et ne proposent pas d’édition ni de
suppression. Les confirmations de suppression utilisent le dialogue natif.
Le calcul du coût, le filtre Petit budget et les parcours IA restent à développer.
Leur accès affiche « Disponible prochainement ».

### Parcours Promos et circulaires

Depuis Promos, rechercher un produit, filtrer par magasin et ouvrir le détail
pour consulter le prix, le format, les dates et le lien marchand. La liste
charge les 100 premières offres actives ; recherche et filtre sont appliqués
ensuite dans le mobile. « Ajouter à la liste » reste en attente.

« Cuisiner avec les promos » rapproche les recettes accessibles et les offres
par `ingredient_id`, puis classe les recettes par nombre d’ingrédients en
promotion. Le prix affiché le plus bas est retenu pour chaque ingrédient,
sans comparaison des formats ni calcul du coût complet de la recette.
Ce parcours fonctionne sans IA ; Petit budget reste à développer.

Dans Circulaires, choisir un magasin pour lire les pages. Toucher une page
ouvre son image ; une circulaire terminée est signalée. Les PDF doivent être
importés côté serveur : voir le [guide backend](../backend/README.md#promos-et-circulaires-de-la-semaine).
Les offres sont lues depuis JSON par défaut ou PostgreSQL avec
`OFFERS_SOURCE=database` côté backend ; le mobile utilise les mêmes routes.

Vérifier recherche, filtres, détail, ouverture d’une recette, lecture des
circulaires, ainsi que les états vide, chargement et erreur. Le fonctionnement
des parcours intégrés a été confirmé sur iOS et Android le 27 octobre.

### Parcours Recettes et maquette

Les éléments retenus de la maquette sont repris dans la liste (en-tête,
recherche, quatre filtres, bouton d’ajout et collection), les deux écrans de
choix et le formulaire. Les grandes cartes avec photos restent présentes.
La police DM Sans et les quatre pictogrammes des parcours sont inclus localement.
`expo-image` affiche ces SVG ; recompiler l’application après installation
des dépendances, comme pour les modules photo.

Le chemin fonctionnel est **Ajouter une recette → Entrer manuellement →
Remplir un formulaire**. Trouver une idée, Cuisiner avec ce qu’on a et
Structurer une idée affichent un message d’attente.
Le formulaire présente le nom, la photo, les portions, la préparation,
les ingrédients avec quantité/unité, les étapes, la difficulté et les étiquettes.
Le choix d’un ingrédient ouvre une liste consultable avec recherche.
Les unités acceptées sont `g`, `ml` et `unit` (pièces entières).
Description et cuisson restent accessibles dans « Autres informations » ;
les valeurs existantes sont conservées lors d’une modification.

La difficulté est facultative et enregistrée avec les étiquettes. Rapide
est calculé jusqu’à 30 minutes au total ; Économique est une étiquette de
l’auteur, sans calcul de prix. Appliquer `0004_recipe_metadata` au backend.

Le 21 octobre 2026, Hamza a confirmé que les ajustements du parcours Recettes
fonctionnent dans l’application. La prévisualisation à 320 et 390 pixels a
aussi été contrôlée sans débordement des champs et boutons ; elle utilise
React Native Web avec des services simulés et ne remplace pas un essai natif.

Pour les vérifications détaillées sur téléphone : les quatre filtres, les
messages d’attente, le retour entre les choix, le clavier dans le formulaire,
l’ajout avec photo/difficulté/étiquettes, puis la modification et la reconnexion.
La confirmation générale ne valide pas séparément tous ces scénarios ;
les essais d’erreur et d’affichage sur différentes tailles restent à compléter.
Le fonctionnement du parcours Recettes sur iOS et Android a été confirmé
par Hamza le 27 octobre ; son coéquipier l’a aussi vérifié sur Android.

```bash
npm test
```

Les 10 tests couvrent les photos, la lecture des quantités et les badges.

## Structure et vérification

### Photos des recettes personnelles

Le formulaire propose une photo facultative depuis la galerie, avec aperçu,
remplacement et retrait. Le sélecteur système donne accès à l’image choisie ;
une annulation conserve la sélection précédente. `expo-image-picker` ouvre
la galerie, `expo-image-manipulator` réduit le côté le plus long à 1 200 pixels
et produit un JPEG compressé, et `expo-file-system` fournit les octets pour
l’envoi. Ces modules natifs nécessitent de recompiler l’application installée :

```bash
npm run ios -- --device
# Sur Android, utiliser plutôt : npm run android -- --device
```

Avant le premier envoi, configurer les droits du bucket depuis la racine :

```bash
./.venv/bin/python -m backend.cli.configure_recipe_images
```

Voir le [guide Storage](../backend/docs/RECIPE_IMAGES.md). La photo est envoyée
seulement après validation du formulaire, à l’enregistrement. L’URL publique
est enregistrée dans `recipe.image_url` par FastAPI. Un refus Storage ou une
erreur réseau conserve le formulaire et permet de réessayer. Si l’envoi réussit
mais que FastAPI échoue, l’URL reste dans le formulaire pour éviter un second
envoi. Une recette peut toujours être enregistrée sans photo.

Vérifier sur téléphone : créer avec une photo, relancer l’application,
remplacer la photo, annuler le sélecteur, retirer la photo puis sauvegarder,
enregistrer sans photo, et essayer un envoi sans connexion. Les photos sont
publiques dans ce prototype même si les recettes sont personnelles ; le
formulaire le précise. Retirer la photo enlève son lien à la recette ; le
nettoyage des fichiers Storage inutilisés reste à développer.

```bash
npm run test:images
```

Les 7 tests du service utilisent des doubles de galerie et de Storage.
Le 21 octobre 2026, Hamza a confirmé que l’ajout d’une photo depuis la galerie
fonctionne sur téléphone après recompilation. Le 27 octobre, Hamza a
également confirmé le parcours des photos sur iOS et Android, avec un essai
Android par son coéquipier. Les essais d’erreur réseau restent à compléter.
Les tests complètent les essais sur téléphone, sans les remplacer. Le lint n’est pas configuré.

### Organisation

L’icône de l’application est dans `assets/icon.png`, copiée du visuel retenu
`data/recipes/images/optimeal.png`. `app.json` l’utilise pour iOS, Android
et le favicon web ; Expo produit les tailles natives. Après son remplacement,
régénérer le projet iOS puis réinstaller l’application :

```bash
npm exec -- expo prebuild --platform ios --no-install
npm run ios -- --device
```

Les cinq onglets utilisent Ionicons via `@expo/vector-icons` et `expo-font` :
maison, étiquette, couverts, calendrier et engrenage, dans cet ordre. Les associations sont
définies dans `App.tsx`, avec une variante pleine en vert pour l’onglet actif
et une variante de contour pour les autres. Ces ressources sont incluses
dans l’application ; elles ne dépendent pas de Supabase.

- `context/AuthContext.tsx` : session, événements Auth, liens de confirmation et premier plan.
- `services/supabase.ts` : client Auth public ; `services/api.ts` : client FastAPI avec jeton et délai.
- `app/` : comptes, profil, recettes, promotions et circulaires.
- `components/promos.ts` : chargement des offres et circulaires, prix et dates.
- `types/` : contrats consommés et paramètres de navigation.

```bash
npm run typecheck
npm exec -- expo export --platform ios --platform android --output-dir /tmp/optimeal-auth-export
```

Les bundles des deux plateformes et TypeScript ont été vérifiés. Le
20 octobre 2026, Hamza a confirmé sur iPhone l’inscription réelle, le lien
de confirmation, le profil, la restauration de session, la liste et le détail,
la recherche, Rapides, le CRUD manuel et les favoris. Les recettes initiales
n’affichent pas d’actions d’édition/suppression ; les données de deux comptes
restent séparées. Le 27 octobre, Hamza a confirmé les parcours comptes,
recettes, photos et Promos sur iOS et Android ; son coéquipier les a également
essayés sur Android. Les scénarios d’erreur complémentaires restent à
effectuer. Voir les [résultats actuels](../README.md#tests).
AsyncStorage est utilisé pour ce socle, conformément au guide de démarrage
Supabase ; le stockage sécurisé des jetons peut être renforcé avant livraison.
`npm audit` signale actuellement des alertes transitives dans l’outillage
Expo/Metro. La correction compatible a été tentée ; une correction complète
reste à évaluer avant livraison. Ne pas appliquer la rétrogradation majeure
Expo suggérée par `--force` sans vérifier sa compatibilité.

Sources : [Supabase React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native)
et [React Navigation](https://reactnavigation.org/docs/getting-started/).

*Dernière mise à jour : 27 octobre 2026*

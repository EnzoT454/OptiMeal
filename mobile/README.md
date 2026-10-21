# Mobile OptiMeal

Socle Expo/TypeScript avec React Navigation : inscription, confirmation de
courriel, connexion, restauration et renouvellement de session, déconnexion,
profil minimal et recettes manuelles. Accueil, Recettes, Calendrier, Promos
et Paramètres sont présents ; Calendrier et Promos sont des emplacements
pour la suite. Aucune fonction IA n’est intégrée.

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
Le coût, Petit budget, les parcours IA et l’ajustement visuel à Figma restent
à développer.

## Structure et vérification

- `context/AuthContext.tsx` : session, événements Auth, liens de confirmation et premier plan.
- `services/supabase.ts` : client Auth public ; `services/api.ts` : client FastAPI avec jeton et délai.
- `app/` : compte, profil, liste, détail et formulaire manuel.
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
restent séparées. Les essais interactifs Android et les scénarios d’erreur
complémentaires restent à effectuer. Voir le [suivi](../docs/suivi.md).
AsyncStorage est utilisé pour ce socle, conformément au guide de démarrage
Supabase ; le stockage sécurisé des jetons peut être renforcé avant livraison.
`npm audit` signale actuellement des alertes transitives dans l’outillage
Expo/Metro. La correction compatible a été tentée ; une correction complète
reste à évaluer avant livraison. Ne pas appliquer la rétrogradation majeure
Expo suggérée par `--force` sans vérifier sa compatibilité.

Sources : [Supabase React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native)
et [React Navigation](https://reactnavigation.org/docs/getting-started/).

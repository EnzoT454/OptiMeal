# Mobile OptiMeal

Socle Expo/TypeScript avec React Navigation : inscription, confirmation de
courriel, connexion, restauration et renouvellement de session, déconnexion,
profil minimal et recettes manuelles avec photo obligatoire à la création, choisie dans la galerie.
Les cinq onglets sont présents : Accueil, Promos, Recettes, Calendrier et
Paramètres. Promos permet de consulter les offres, les circulaires et les
recettes associées aux ingrédients en promotion. Calendrier permet de conserver
et modifier les repas d’une semaine ; les essais sur appareil et les
instantanés historiques restent à compléter.
Les parcours comptes, recettes, photos et Promos sont confirmés sur iOS et
Android au 27 octobre 2026. Aucune fonction IA n’est intégrée.

Les ajustements de Recettes du 5 novembre sont confirmés fonctionnels sur
téléphone : cartes compactes et cliquables, favoris directs, filtre Faciles,
icônes, retrait de la difficulté saisie par l’auteur et tri par création dans
Mes recettes. La confirmation inclut les derniers ajustements du formulaire,
le sélecteur d’unités, la publication définitive et les moyennes par critère
avec icônes. La plateforme n’est pas précisée ; la validation distincte iOS
et Android et les scénarios d’erreur détaillés restent à compléter.

## Consultation sans compte

L’application s’ouvre sur l’accueil sans imposer de connexion. Les visiteurs
peuvent consulter Accueil, Promos, les circulaires, les recettes partagées
et Paramètres. Les recherches, détails et recettes associées aux promotions
restent accessibles.

La connexion est proposée pour ajouter ou noter une recette, utiliser les favoris,
accéder au calendrier ou modifier le profil. Le calendrier est désormais
accessible aux comptes connectés, avec des repas sauvegardés. Les paramètres visiteurs présentent un accès
à la connexion sans appeler la route privée du profil.

La fenêtre de connexion propose « Continuer sans compte » ; le retour Android
permet aussi de la fermer. Une connexion ou déconnexion réinitialise la
navigation vers l’accueil ; après connexion, relancer l’action souhaitée.
La déconnexion conserve l’accès public et retire les écrans du compte précédent.
Les autorisations backend restent nécessaires pour toutes les données privées.

Essais à reproduire sur iOS et Android pour ce nouveau parcours :

1. Sans session, ouvrir les onglets publics, consulter une recette, une promo et une circulaire.
2. Appuyer sur Ajouter, Mes recettes, Favoris et Ajouter aux favoris : vérifier la demande de connexion, puis l’annuler et poursuivre la consultation.
3. Ouvrir Calendrier et Paramètres : vérifier la demande de connexion et l’absence de formulaire de profil visiteur.
4. Créer un compte ou se connecter depuis la fenêtre, puis ajouter une recette et modifier son profil.
5. Se déconnecter : vérifier le retour à l’accueil visiteur et l’absence des recettes personnelles et favoris du compte précédent.
6. Refaire avec deux comptes ; fermer la fenêtre par le retour Android, puis vérifier la confirmation du courriel par lien.

Le mode visiteur et la connexion à la demande ont été confirmés par Hamza
sur iOS le 1er novembre. Leur reproduction sur Android et les scénarios
d’erreur détaillés restent à compléter.

## Noter une recette

Le détail affiche les moyennes Goût, Fiabilité et Facilité ainsi qu’une note
globale et le nombre d’évaluations. Les pondérations restent internes au calcul. Sans vote, il affiche
« Pas encore évaluée ». Un visiteur peut consulter les notes ; « Noter cette
recette » propose la connexion. Le bouton n’est pas proposé pour sa propre
recette ni pour une recette privée.

Dans le détail, les moyennes Goût, Fiabilité et Facilité sont présentées
sur une ligne à trois colonnes, avec icône, libellé et note sur 5. Les textes
peuvent grandir sans être tronqués ; les lecteurs d’écran annoncent chaque
critère avec sa moyenne. Goût utilise les couverts horizontaux pointant à
droite ; Facilité reprend la poêle et l’œuf du filtre Faciles. Cet affichage
est inclus dans la confirmation globale sur téléphone du 5 novembre.

Le formulaire défilant conserve son introduction, puis présente chaque critère
et sa question directement suivis de cinq étoiles accessibles, numérotées de
1 à 5, sans explication supplémentaire ni pondération affichée. Les trois critères sont
obligatoires, sans présélection. En modification, les notes enregistrées sont
préchargées. Enregistrer attend la réponse du serveur ; Annuler et le retour
Android ferment sans écrire. Une erreur réseau conserve la saisie. Supprimer
son évaluation demande confirmation, puis recharge le détail. Si seule la
suppression réussit, les anciennes moyennes sont masquées et « Actualiser
les moyennes » permet de les recharger.

Le backend doit avoir la migration `0013_rating_versions` et les routes de
notation de l’étape 5. Les migrations jusqu’à `0013` sont appliquées sur
Supabase depuis le 2 novembre 2026.
Les cartes affichent aussi la moyenne et l’effectif ; les tris sont décrits
ci-dessous. Les questions, droits et
contrats sont décrits dans [RATINGS.md](../backend/docs/RATINGS.md).

Validation du 2 novembre, étape 9 : 100 tests mobiles réussis, TypeScript valide et
bundles iOS/Android générés avec Node 22.23.3. Le lint n’est pas configuré.
La validation finale confirme aussi les migrations et lectures sur Supabase.
Le [bilan technique](../backend/docs/RATINGS_VALIDATION.md) distingue les contrôles automatisés et la confirmation sur téléphone.
Hamza confirme le 2 novembre 2026 que les tests sur téléphone fonctionnent
après les derniers ajustements ; la plateforme n’a pas été précisée.
Les tests utilisent des composants et services natifs simulés ; les essais
suivants constituent le protocole de référence ; la confirmation sur téléphone
est globale, sans détail distinct par plateforme :

1. En visiteur, lire les notes, demander la connexion puis l’annuler.
2. Avec un compte, ouvrir une recette d’autrui, lire les questions et
   vérifier qu’aucune étoile n’est présélectionnée.
3. Choisir les trois notes, enregistrer, rouvrir et modifier son évaluation.
4. Annuler une saisie et une suppression ; confirmer ensuite la suppression.
5. Couper le réseau pendant une soumission : vérifier la conservation de la
   saisie, puis réessayer après rétablissement.
6. Retirer le public depuis un autre compte avant soumission : vérifier
   l’affichage « Recette indisponible » sans succès annoncé.
7. Vérifier le défilement sur petit écran, les grandes polices et la sélection
   des étoiles avec VoiceOver/TalkBack ; quitter puis changer de compte pour
   vérifier l’absence de saisie ou de réponse de l’ancien compte.
8. Noter une recette d’autrui, puis modifier ses ingrédients ou étapes depuis
   le compte auteur : vérifier que la note courante revient à zéro évaluation,
   que l’ancien vote est identifié et que Réévaluer ouvre trois choix vides.
9. Modifier la recette depuis le compte auteur pendant que l’autre compte
   remplit son formulaire : vérifier le refus, l’actualisation et la relecture,
   sans réenvoi automatique des notes. Supprimer ensuite sa contribution et
   vérifier la confirmation mentionnant aussi les anciennes versions.

Chaque vote envoie le `recipe_version` du contenu consulté. Les changements
d’ingrédients, d’étapes, de portions ou de durées ouvrent une nouvelle version ;
les notes précédentes ne comptent plus. Le détail affiche la dernière note
personnelle même ancienne et propose « Réévaluer la recette », sans
présélection. Les changements de nom, photo ou visibilité ne l’invalident pas.
L’éditeur explique ces effets avant enregistrement. Un conflit 409 ferme le
formulaire, abandonne les choix et demande d’actualiser puis de relire la
recette. Supprimer sa contribution retire toutes ses versions pour la recette.

Depuis Cuisiner avec les promos, les cartes affichent les notes et ouvrent
la même fiche pour noter ; le retour recharge les résultats. Depuis le menu
d’un repas accessible du Calendrier, « Voir la recette »
ouvre aussi cette fiche. Cette action est absente pour les notes libres et
recettes indisponibles ; planifier ne crée jamais de vote. La suppression du
compte depuis Paramètres retire ses votes, y compris les anciennes versions.
Les essais réels suivants constituent le protocole de référence ; la confirmation sur téléphone
est globale, sans détail distinct par plateforme : noter depuis
une carte Promos puis vérifier son actualisation au retour ; ouvrir les
évaluations depuis Calendrier ; vérifier qu’une recette publiée reste publique
et accessible après suppression du compte auteur ; vérifier le retrait des contributions
après suppression d’un compte de test.

## Sections de l’onglet Recettes

L’écran propose Découvrir, Mes recettes et Favoris. Découvrir affiche les
recettes publiques d’OptiMeal et des utilisateurs ; Mes recettes affiche toutes
les créations du compte, privées et publiques ; Favoris affiche les favoris
encore accessibles. Les sections personnelles demandent une connexion. Les
requêtes utilisent `scope=discover`, `scope=mine` ou `scope=favorites`, avec
recherche, filtre Rapides et pagination de 20 recettes. Le backend doit être
à la tête `0015_permanent_public_recipes` pour cette version. Les migrations
`0014` et `0015` ont été appliquées sur Supabase le 5 novembre, après les
migrations de notation du 2 novembre.

Le choix de section est conservé tant que l’écran reste monté, y compris au
retour d’un détail. Une connexion ou déconnexion réinitialise la navigation.
Favoris est une section ; les filtres sont désormais Toutes, Rapides, Faciles et Petit
budget. Ce dernier conserve son message d’attente. Le formulaire et le détail proposent désormais le choix de publication.

Chaque carte affiche une photo au format 16:9, le titre, puis la durée, les
portions et les nombres d’ingrédients et d’étapes avec des icônes. L’auteur et,
dans Mes recettes, la visibilité figurent en bas à gauche. La note et le nombre
d’évaluations sont alignés à droite : étoile, « 4,5 (28) », ou « Non notée ».
Le cœur en haut à droite de la photo permet d’ajouter ou retirer un favori
directement : contour pour ajouter, plein pour retirer. Sa zone tactile est
de 48 × 48 et il reste accessible séparément de l’ouverture de la carte.
Un indicateur remplace le cœur pendant l’enregistrement ; les doubles appuis
sont bloqués. En cas d’échec, la carte conserve son état et affiche une erreur.
Les visiteurs sont invités à se connecter. Retirer un favori dans Favoris
recharge la liste et son compteur, avec retour à la page précédente si besoin.
Le reste de la carte ouvre le détail.
Découvrir et Favoris proposent Mieux notées (par défaut, `sort=top`) et Plus
récentes (`sort=newest`). Mes recettes affiche les créations de la plus récente
à la plus ancienne (`sort=newest`), sans sélecteur de tri. Le choix est conservé par
section et au retour du détail. Changer de tri ramène à la première page en
conservant recherche et filtres. Le serveur trie l’ensemble des résultats
avant pagination ; le mobile ne retrie pas les cartes chargées.

Mieux notées tient compte de l’effectif sans modifier la moyenne affichée.
Sans vote, une recette est placée après celles évaluées. Plus récentes utilise
la publication, ou la création en base si elle manque ; le tri de
Mes recettes utilise uniquement la création. Les dates des anciennes recettes
peuvent être inconnues et vont à la fin. Sur téléphone, vérifier le changement
de tri depuis une deuxième page, le retour du détail après un vote et les
grandes polices des contrôles de tri.

Les tests mobiles et TypeScript passent. Le lint n’est pas configuré.
Derniers ajustements confirmés globalement sur téléphone le 5 novembre, sans
plateforme précisée. Le protocole suivant reste la référence pour les résultats
distincts iOS/Android et les scénarios d’erreur non détaillés :

1. Sans compte, consulter Découvrir puis annuler la connexion demandée par Mes recettes et Favoris ; Découvrir reste sélectionnée.
2. Avec un compte, retrouver ses créations dans Mes recettes avec le badge Privée/Publique, puis ses favoris dans Favoris.
3. Chercher et activer Rapides dans chaque section ; vérifier la remise à la première page lors d’un changement de section ou de recherche.
4. Ouvrir un détail, modifier ses favoris et revenir : la section est conservée et les données sont rechargées.
5. Vérifier les listes vides et leurs actions : première recette, Découvrir et effacement de recherche/filtres.
6. Couper le réseau, réessayer, puis changer de section pendant un chargement ; vérifier l’absence de résultats de la section précédente.
7. Se déconnecter et changer de compte : aucune recette privée ni favori du compte précédent ne doit rester affiché.

## Publication depuis le formulaire et le détail

Le formulaire propose « Partager avec la communauté » pour une recette privée.
L’interrupteur prépare le choix ; seule la sauvegarde le publie, après une
confirmation expliquant que la publication est définitive. Une recette déjà
publique ne propose plus d’interrupteur ni d’action Rendre privée ou Supprimer.
Son propriétaire peut encore modifier son contenu.

En édition, une publication suit le PUT réussi du contenu. Une erreur entre
les deux opérations affiche un message de sauvegarde partielle.
Après suppression du compte auteur, les recettes publiques et leurs photos
restent dans Découvrir et les calendriers sans lien avec l’ancien compte.
Le backend doit utiliser la migration `0015_permanent_public_recipes`.

Scénarios à reproduire sur iOS et Android avec deux comptes :

1. Créer une recette sans activer le partage : elle figure dans Mes recettes et reste inaccessible à l’autre compte.
2. Activer le partage : aucune publication avant Enregistrer ; annuler la confirmation n’envoie aucune photo ni recette.
3. Confirmer une création publique : elle figure dans Mes recettes et Découvrir, et devient consultable par un visiteur ou l’autre compte.
4. Depuis le détail privé, annuler puis confirmer Publier ; vérifier le statut et l’absence des actions Rendre privée et Supprimer après publication.
5. Publier une recette privée depuis le formulaire ; rouvrir une recette publique et vérifier que son contenu reste modifiable mais sa visibilité est fixe.
6. Couper le réseau pendant l’enregistrement ou le changement de visibilité ; vérifier les messages, l’absence de faux succès et la possibilité de réessayer.
7. Vérifier qu’une recette d’autrui ou initiale n’affiche aucune action de publication, modification ou suppression.
8. Après suppression du compte auteur, vérifier avec l’autre compte que les recettes publiques et leurs photos restent dans Découvrir, ses favoris et ses repas planifiés.

Avant la publication définitive introduite le 5 novembre, Hamza avait confirmé le 1er novembre 2026 les trois scénarios manuels de partage : création privée puis publication, retrait avec masquage des favoris puis republication, et choix de visibilité dans le formulaire avec contrôle des actions du propriétaire. La plateforme de cet essai n’a pas été précisée ; cette confirmation ne valide pas séparément iOS et Android ni les scénarios d’erreur réseau.

## Calendrier connecté

Le calendrier intégré depuis `main` le 1er novembre propose une semaine,
l’ajout de recettes ou de notes, les favoris, les portions et un menu pour
déplacer, dupliquer, retirer un repas ou prévoir des restes. Les données sont
enregistrées via `/api/v1/plans`. Appliquer `0008_meal_plan` côté serveur avant
les essais ; aucune migration distante n’est exécutée par le mobile.

Le calendrier reste protégé en mode visiteur. Les recettes sont liées à leur
version courante : une suppression ou une perte d’accès conserve le repas
avec le libellé « Recette indisponible ». Pour ce repas, seules les actions
Portions, Déplacer et Retirer restent proposées. Le calendrier recharge les
données à chaque retour dans l’onglet. La migration `0010_preserve_meals` est
requise côté serveur, appliquée sur Supabase le 1er novembre. Les
instantanés historiques et les listes d’épicerie restent à développer. Voir
le [guide du calendrier](../backend/docs/PLANNING.md) pour les routes, les
limites et les scénarios détaillés. Hamza a confirmé le 1er novembre
l’application de `0008_meal_plan` sur Supabase et le fonctionnement du
calendrier sur iOS. Les essais Android et les scénarios d’erreur détaillés
restent à compléter ; l’historique par instantanés reste à développer.

## Supprimer son compte

Dans **Paramètres**, connecté à son compte, choisir **Supprimer mon compte**,
saisir `SUPPRIMER`, puis **Confirmer la suppression**. Annuler ne modifie rien.
La suppression est définitive : compte, profil, recettes privées, favoris et
repas planifiés sont retirés. Les recettes publiques et leurs photos restent
accessibles sans lien avec l’ancien compte. Après succès, la session
locale est effacée et l’application revient à l’accueil visiteur.

Le backend doit disposer de `SUPABASE_SECRET_KEY`, uniquement dans
`backend/.env`, puis être redémarré après configuration. Le traitement passe
par `DELETE /api/v1/me` ; aucune clé privilégiée n’est distribuée au mobile.
Une interruption peut survenir après la suppression de certaines photos :
le message d’échec invite à réessayer sans annoncer une réussite. Voir les
[limites détaillées](../backend/docs/AUTH.md#suppression-définitive-du-compte).

Pour l’essai réel, utiliser un compte de test dédié avec une recette, un
favori et une photo. Vérifier l’annulation, le refus d’une confirmation
incorrecte, le retour au mode visiteur après suppression et l’impossibilité
de se reconnecter avec ce compte. Vérifier aussi qu’un autre compte et les
recettes partagées sont conservés. La suppression du compte est confirmée par Hamza sur iOS le 1er novembre ;
les essais Android et les scénarios détaillés d’interruption restent à compléter.
Les tests automatisés utilisent des fournisseurs simulés.

## 1. Installer

Depuis `mobile/` :

```bash
npm ci
npm run typecheck
```

Le SDK Expo 58 demande Node 22.13+ compatible. Un Node 22 local est installé
en dépendance de développement : les scripts `npm run …` l’utilisent sans
modifier l’installation globale. `.nvmrc` fixe la version retenue, 22.23.3.
Le fichier `package-lock.json` fixe les dépendances. Pour installer avec Node
22 dès le départ, sélectionner cette version dans votre gestionnaire Node.
Le fichier `.nvmrc` ne l’installe pas automatiquement et exige nvm si l’on
utilise `nvm install` ou `nvm use`. Sans gestionnaire, installer cette version
de Node directement. Vérifier `node --version` avant `npm ci` : le Node local
du projet ne remplace pas celui du terminal pour cette commande.

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
| Téléphone sur le même réseau local | `http://IP_LOCALE_DU_MAC:8001` |

Depuis la racine, dans un autre terminal avec Python activé :

```bash
python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8001
```

Les migrations et imports décrits dans le [guide backend](../backend/docs/MIGRATIONS.md)
doivent être appliqués. Les appels privés envoient le jeton courant à FastAPI.
Une réponse 401 provoque au maximum une tentative de renouvellement avant
retour d’une erreur ; une panne réseau garde les données non enregistrées
dans le formulaire pour permettre une nouvelle tentative.

Pour un téléphone, utiliser un réseau permettant la communication avec le
Mac. Le Mac peut être en Ethernet et le téléphone en Wi-Fi sur le même
routeur ; un réseau invité peut isoler les appareils. Utiliser l’IP de
l’interface active du Mac. `ipconfig getifaddr en0` ne renvoie rien si cette
interface n’a pas d’adresse IPv4. Dans ce cas :

```bash
networksetup -listallhardwareports
```

Repérer le nom `Device` de Wi-Fi ou Ethernet, puis lancer par exemple
`ipconfig getifaddr en5` si l’interface active est `en5`. On peut aussi lire
l’adresse dans les détails TCP/IP du réseau dans Réglages Système. Ouvrir `http://IP_LOCALE_DU_MAC:8001/health` dans le navigateur du
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

1. Depuis Paramètres, ouvrir la connexion, créer un compte avec votre adresse et confirmer le courriel reçu.
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

### iPhone : renouveler la signature du compte Apple gratuit

Avec une **Personal Team** gratuite, le profil permettant d’installer
l’application expire **7 jours après sa création**. Il faut alors renouveler
la signature et réinstaller l’application pour poursuivre les essais. Cette
durée ne peut pas être prolongée par un réglage du projet.
Voir les [limites du compte gratuit chez Apple](https://developer.apple.com/help/account/basics/about-your-developer-account).

Si iOS affiche « L’app n’est plus disponible », l’expiration est une cause
possible, à distinguer d’un serveur Expo ou FastAPI arrêté. Brancher et
déverrouiller l’iPhone, puis essayer depuis `mobile/` :

```bash
npx expo run:ios --device --port 8082
```

Si la compilation échoue avec **No profiles for 'com.anonymous.optimeal'
were found** et demande `-allowProvisioningUpdates`, autoriser Xcode à
générer le profil. La commande suivante a permis de résoudre ce problème
lors des essais sur l’iPhone 12. Remplacer `IDENTIFIANT_IPHONE` par
l’identifiant affiché par Expo après le choix de l’appareil :

```bash
xcodebuild \
  -workspace ios/OptiMeal.xcworkspace \
  -scheme OptiMeal \
  -configuration Debug \
  -destination 'id=IDENTIFIANT_IPHONE' \
  -allowProvisioningUpdates \
  build
```

Cette commande compile et permet la mise à jour du profil ; elle ne réinstalle
pas à elle seule l’application. Après sa réussite, relancer :

```bash
npx expo run:ios --device --port 8082
```

Le compte Apple doit être connecté dans **Xcode → Settings → Apple Accounts**.
Si nécessaire, ouvrir `ios/OptiMeal.xcworkspace`, sélectionner la cible
**OptiMeal → Signing & Capabilities**, vérifier **Automatically manage signing**
et la **Personal Team**, puis sélectionner l’iPhone et lancer **Run**.
Voir le [fonctionnement de la signature dans Xcode](https://help.apple.com/xcode/mac/current/en.lproj/dev60b6fbbc7.html).

Conserver le même Bundle Identifier (`com.anonymous.optimeal`) et la même
équipe de signature. Ne pas supprimer l’application avant cette opération :
la réinstallation par-dessus peut préserver ses données locales.

Expo démarre normalement Metro pendant la réinstallation ; éviter de lancer
un second serveur sur le même port. Pour les sessions suivantes, depuis
`mobile/` :

```bash
npx expo start --dev-client --port 8082 --lan
```

FastAPI doit aussi fonctionner, sur le port **8001**. Le port **8082** est
celui d’Expo et ne remplace pas le port de `EXPO_PUBLIC_API_URL`.
L’avertissement du script « Strip Local Network Keys for Release » est
distinct de l’erreur de profil de signature.

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

Chaque carte affiche également la note courante et son effectif, sans changer
le classement par ingrédients en promotion. Ouvrir la carte réutilise le
détail Recettes et son formulaire ; revenir recharge les notes. Une recette
supprimée ou devenue privée entre liste et détail est ignorée ; une panne
de chargement garde son état d’erreur et le bouton Réessayer.

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
sections Découvrir/Mes recettes/Favoris, recherche, filtres Toutes/Rapides/Faciles/Petit budget, bouton d’ajout et collection), les deux écrans de
choix et le formulaire. Les grandes cartes avec photos restent présentes.
La police DM Sans et les quatre pictogrammes des parcours sont inclus localement.
`expo-image` affiche ces SVG ; recompiler l’application après installation
des dépendances, comme pour les modules photo.

Le chemin fonctionnel est **Ajouter une recette → Entrer manuellement →
Remplir un formulaire**. Trouver une idée, Cuisiner avec ce qu’on a et
Structurer une idée affichent un message d’attente.
Le formulaire présente le nom, la photo, les portions, la préparation,
les ingrédients avec quantité séparée du choix d’unité, les étapes,
les étiquettes et le réglage de partage.
Le choix d’un ingrédient ouvre une liste consultable avec recherche.
Les unités acceptées sont `g`, `ml`, `unit` (pièces entières), `cup` (tasse, 250 ml),
`tbsp` (cuillère à table, 15 ml) et `tsp` (cuillère à thé, 5 ml).
Le formulaire utilise un sélecteur compact à côté de la quantité. Il ouvre
une liste en bas de l’écran avec le choix actuel coché, six options et un
bouton Fermer ; le retour Android ferme sans modifier le choix. La liste
défile sur les petits écrans ou avec de grandes polices. Aucune unité
n’est présélectionnée pour un nouvel ingrédient.
Le formulaire et le détail affichent les libellés français, avec le volume
des tasses et des cuillères. Les demi-mesures se saisissent avec une décimale, par exemple
`0,5`. Le backend et la base doivent être à jour jusqu’à la migration
`0014_recipe_kitchen_units` pour sauvegarder ces nouvelles unités.
Description et cuisson restent accessibles dans « Autres informations » ;
les valeurs existantes sont conservées lors d’une modification.

La difficulté n’est plus choisie par l’auteur dans le formulaire ni affichée
comme métadonnée dans le détail. Les autres utilisateurs évaluent la facilité
avec le critère « Facilité » de la notation. Les anciennes valeurs restent
conservées côté backend pour compatibilité. Rapide
est calculé jusqu’à 30 minutes au total ; Économique est une étiquette de
l’auteur, sans calcul de prix. Appliquer `0004_recipe_metadata` au backend.

Le 21 octobre 2026, Hamza a confirmé que les ajustements du parcours Recettes
fonctionnent dans l’application. La prévisualisation à 320 et 390 pixels a
aussi été contrôlée sans débordement des champs et boutons ; elle utilise
React Native Web avec des services simulés et ne remplace pas un essai natif.

Pour les vérifications détaillées sur téléphone : les trois sections, les
filtres Toutes/Rapides/Faciles/Petit budget, les
messages d’attente, le retour entre les choix, le clavier dans le formulaire,
l’ajout avec photo et étiquettes, puis la modification et la reconnexion.
La confirmation générale ne valide pas séparément tous ces scénarios ;
les essais d’erreur et d’affichage sur différentes tailles restent à compléter.
Le fonctionnement du parcours Recettes sur iOS et Android a été confirmé
par Hamza le 27 octobre ; son coéquipier l’a aussi vérifié sur Android.

```bash
npm test
```

Les 100 tests couvrent les photos, les quantités, les badges, les accès visiteurs,
les sessions, les sections et la publication des recettes, ainsi que les repas
indisponibles et les actions du calendrier. Ils couvrent aussi le formulaire
de notation, ses erreurs, le blocage des autres mutations du détail, les notes
sur les cartes, la conservation des tris par section, les anciennes notes et
la réévaluation après conflit de version, les notes depuis Promos et l’accès
aux évaluations depuis Calendrier.
Les appels externes sont simulés.

## Structure et vérification

### Photos des recettes personnelles

Le formulaire exige une photo à la création, choisie depuis la galerie, avec aperçu,
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
envoi. Sans photo choisie ou URL déjà obtenue, le bouton d’enregistrement est désactivé et la création est refusée. Un échec d’envoi de la photo empêche aussi la création. Les anciennes recettes sans photo restent modifiables.

Vérifier sur téléphone : créer avec une photo, relancer l’application,
remplacer la photo, annuler le sélecteur, retirer la sélection avant création et vérifier le blocage,
vérifier que la création sans photo est bloquée, et essayer un envoi sans connexion. Les photos sont
publiques dans ce prototype même si les recettes sont personnelles. Retirer la photo enlève son lien à la recette ; le
nettoyage courant des fichiers Storage inutilisés après remplacement ou retrait
reste à développer. La suppression du compte conserve d’abord les photos des
recettes publiques sous `community/`, puis nettoie le dossier personnel.

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

Le 1er novembre 2026, Hamza a confirmé le fonctionnement sur iOS du mode visiteur, de la connexion à la demande, de la photo obligatoire à la création, des photos de produits dans Promos et de la suppression du compte. Cette confirmation générale ne constitue pas un résultat individuel pour chaque scénario d’erreur. Les nouveaux parcours restent à reproduire sur Android.

Sources : [Supabase React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native)
et [React Navigation](https://reactnavigation.org/docs/getting-started/).

*Dernière mise à jour : 5 novembre 2026*

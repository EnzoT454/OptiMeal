# Comprendre le fonctionnement d’OptiMeal

Ce guide explique comment les écrans, le serveur, Supabase et les fichiers du dépôt travaillent ensemble. Il suit des actions concrètes : se connecter, enregistrer une recette avec une photo, consulter les promotions et ouvrir une circulaire.

Il décrit le code et les confirmations disponibles au **1er novembre 2026**, y compris le mode visiteur, la connexion à la demande, la suppression du compte, la photo obligatoire à la création et les photos des produits dans Promos. La présence d’un parcours dans le code ne signifie pas qu’il a été vérifié sur tous les appareils ; les essais confirmés et les fonctions encore prévues sont présentés séparément. Les schémas sont écrits en Mermaid et peuvent être lus dans un aperçu Markdown compatible, notamment sur GitHub.

## 1. Les grandes parties de l’application

Le **frontend** est l’application mobile : il affiche les écrans et reçoit les actions de l’utilisateur. Le **backend** est le serveur : il répond aux demandes du mobile, vérifie les droits et lit ou enregistre les données.

Supabase fournit trois services utilisés par OptiMeal : **Auth** pour les comptes, **PostgreSQL** pour les données et **Storage** pour les images.

```mermaid
flowchart LR
    U[Utilisateur] --> M[Application mobile]
    M <-->|HTTP et JSON avec jeton| B[Backend FastAPI]
    J[Fichiers JSON locaux] -->|Ingrédients et offres selon configuration| B
    subgraph S[Supabase]
        A[Auth : identité et sessions]
        D[(PostgreSQL : données)]
        I[Storage : images]
    end
    M <-->|Inscription et connexion| A
    B -->|Vérification du jeton| A
    B <-->|Requêtes SQL| D
    M <-->|Photos de recettes et lecture des circulaires| I
    M -->|Lecture directe des photos de produits| P[Serveurs images des magasins]
```

| Partie | Question à laquelle elle répond | Exemple |
| --- | --- | --- |
| Mobile React Native | Que voit et que fait l’utilisateur ? | Remplir le formulaire d’une recette |
| Supabase Auth | Qui est connecté ? | Fournir une session après connexion |
| FastAPI | La demande est-elle valide et autorisée ? | Vérifier que la recette appartient au compte |
| PostgreSQL | Quelles données conserver ou retrouver ? | Enregistrer la recette et ses ingrédients |
| Supabase Storage | Où conserver les fichiers images ? | Héberger les photos de plats et les pages des circulaires |
| JSON locaux | Quelles captures préparées sont disponibles ? | Fournir le catalogue commun des offres |

Le mobile contacte directement Auth et Storage. Pour les tables métier, comme les recettes et les profils, il passe par FastAPI. Les identifiants PostgreSQL restent côté serveur.

## 2. Où fonctionne chaque partie pendant le développement ?

Dans le montage local décrit par le dépôt, l’application fonctionne sur le téléphone, tandis que deux serveurs distincts fonctionnent sur l’ordinateur.

```mermaid
flowchart LR
    subgraph O[Ordinateur de développement]
        E[Expo Metro : port 8081 ou autre port choisi]
        B[FastAPI : port 8001]
        J[Fichiers data/catalog]
    end
    T[OptiMeal sur le téléphone]
    S[Supabase sur Internet]
    E -->|Code JavaScript de développement| T
    T <-->|Demandes de données| B
    J --> B
    T <-->|Auth et Storage| S
    B <-->|Auth et PostgreSQL| S
```

**Expo Metro fournit le code de développement au mobile. FastAPI fournit les données métier.** Le fichier `mobile/metro.config.js` configure le bundler Metro ; il n’a aucun lien avec l’épicerie Metro.

Sur un téléphone, `localhost` désigne le téléphone. L’URL du backend doit donc utiliser l’adresse locale de l’ordinateur, par exemple `http://192.168.1.20:8001`. Cette adresse est un exemple à remplacer. Le téléphone et l’ordinateur doivent pouvoir communiquer sur le réseau.

| Si un composant est arrêté | Conséquence dans ce montage |
| --- | --- |
| FastAPI | Les lectures et enregistrements métier échouent |
| Expo Metro | Le chargement ou l’actualisation du JavaScript de développement est interrompu |
| Accès Internet à Supabase | La connexion, les accès à la base distante et les photos sont affectés |
| Ordinateur | Les deux serveurs locaux deviennent indisponibles |

Pour une utilisation autonome, il faudra une version mobile contenant son code JavaScript et un backend hébergé à une adresse accessible. Le site GitHub Pages actuel héberge la documentation.

Sur iPhone, la signature de développement constitue une autre condition
d’ouverture : avec une Personal Team Apple gratuite, le profil expire après
7 jours. Un renouvellement et une réinstallation sont alors nécessaires,
indépendamment des serveurs. Le [guide mobile](mobile/README.md#iphone--renouveler-la-signature-du-compte-apple-gratuit)
donne la procédure et la commande `xcodebuild -allowProvisioningUpdates`
utilisée lorsqu’Expo ne peut pas générer le profil manquant.

## 3. Ouvrir l’application et se connecter

[mobile/App.tsx](mobile/App.tsx) contient la navigation et choisit ce qui doit être affiché selon la session. [AuthContext.tsx](mobile/context/AuthContext.tsx) partage l’état de connexion entre les écrans.

```mermaid
flowchart TD
    A[Ouverture de l’application] --> B[Restaurer la session éventuelle]
    B --> T[Afficher les cinq onglets]
    T --> P[Consulter accueil, promos, recettes et paramètres]
    T --> C[Ajouter une recette, gérer ses favoris ou accéder au calendrier et au profil]
    C --> Q{Compte connecté ?}
    Q -->|Oui| R[Accéder au parcours personnel]
    Q -->|Non| L[Proposer la connexion ou la création de compte]
    L --> S[Connexion auprès de Supabase Auth]
    L -->|Continuer sans compte| P
    S --> V{Connexion réussie ?}
    V -->|Oui| H[Revenir à l’accueil avec la session du compte]
    V -->|Non| E[Afficher une erreur et permettre de réessayer]
    E --> L
```

À l’inscription, l’utilisateur doit confirmer son courriel. Le retour dans l’application utilise le lien `optimeal://auth/callback` et un échange de code pour obtenir la session.

Les cinq onglets sont visibles avec ou sans compte. Accueil affiche un message de bienvenue ; Promos regroupe les offres et les circulaires ; Recettes permet de consulter et gérer les plats ; Calendrier permet de gérer les repas d’une semaine ; Paramètres présente le mode visiteur ou, après connexion, le profil et la déconnexion. Sans compte, Calendrier demande de se connecter avant de charger les repas personnels. React Navigation organise ces onglets et les écrans de détail de Recettes et Promos.

Le client [services/supabase.ts](mobile/services/supabase.ts) configure Supabase et conserve la session avec AsyncStorage. `AuthContext.tsx` écoute aussi les changements de connexion et gère le retour du lien de confirmation. La consultation est accessible sans session ; chaque demande protégée reste vérifiée par le serveur.

La connexion s’ouvre dans une fenêtre que l’on peut fermer avec « Continuer sans compte » ou le retour Android. Annuler conserve la page consultée. Une connexion, une déconnexion ou un changement de compte réinitialise la navigation vers l’accueil, afin de retirer les écrans et données du compte précédent. Après connexion, l’utilisateur peut relancer l’action souhaitée.

[AccountRequired.tsx](mobile/components/AccountRequired.tsx) protège aussi les écrans d’ajout, de saisie et d’édition lorsqu’ils sont ouverts directement. Les paramètres visiteurs ne demandent pas le profil privé à l’API. Le calendrier est soumis à la connexion ; les instantanés historiques et les listes restent à développer.

### Supprimer son compte depuis Paramètres

L’utilisateur connecté peut choisir « Supprimer mon compte », saisir
`SUPPRIMER` et confirmer. Le mobile envoie `DELETE /api/v1/me` avec son jeton ;
il ne choisit jamais librement l’identifiant du compte à supprimer.

```mermaid
flowchart TD
    U[Paramètres : saisir SUPPRIMER et confirmer] --> A[FastAPI : vérifier la session et la confirmation]
    A --> S[Retirer les photos de users/id dans recipes-images]
    S --> D[Supabase Auth : supprimer définitivement le compte]
    D --> C[PostgreSQL : cascades vers profil, recettes et favoris]
    C --> R[Réponse 204]
    R --> M[Effacer la session locale et revenir à l’accueil visiteur]
```

[accounts/deletion.py](backend/app/accounts/deletion.py) appelle Storage et
Auth avec la clé serveur `SUPABASE_SECRET_KEY`. Les relations existantes
suppriment les données métier, y compris les repas planifiés, par cascade. Les recettes partagées,
les autres comptes et les circulaires sont conservés. Les fichiers inutilisés
du dossier photo sont aussi supprimés. En cas d’échec, des photos peuvent déjà
avoir disparu : Storage et Auth ne partagent pas de transaction. La suppression
du compte est confirmée sur iOS le 1er novembre ; les essais Android et les
scénarios d’interruption restent à compléter. Les tests ordinaires
utilisent des fournisseurs simulés. Voir le [guide Auth](backend/docs/AUTH.md#suppression-définitive-du-compte).

### À quoi sert le jeton ?

Supabase Auth délivre un **jeton d’accès**, aussi appelé JWT. Le mobile le joint aux appels FastAPI dans l’en-tête `Authorization: Bearer …`.

[backend/app/security.py](backend/app/security.py) vérifie ce jeton auprès de Supabase Auth, via `/auth/v1/user`, puis obtient l’identité du compte. Les services métier utilisent cette identité pour contrôler les droits.

Par exemple, être connecté avec le compte B ne donne pas le droit de modifier une recette du compte A. Masquer un bouton dans l’écran améliore l’interface ; le contrôle décisif se fait aussi dans le backend.

## 4. Consulter les recettes : le trajet complet

Une **API** est une interface entre programmes. Ici, le mobile envoie une requête HTTP à FastAPI et reçoit du JSON, un format de données structuré.

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant M as RecipeListScreen
    participant C as services/api.ts
    participant B as FastAPI
    participant A as Supabase Auth
    participant D as PostgreSQL
    U->>M: Ouvrir Recettes
    M->>C: Charger la liste
    C->>B: GET /api/v1/recipes avec jeton
    B->>A: Vérifier le jeton
    A-->>B: Identité du compte
    B->>D: Lire les recettes accessibles
    D-->>B: Recettes initiales et personnelles du compte
    B-->>C: JSON avec items, total et pagination
    C-->>M: Données de la liste
    M-->>U: Cartes de recettes
```

Le fichier [RecipeListScreen.tsx](mobile/app/RecipeListScreen.tsx) demande la liste et affiche les états de chargement, d’erreur ou de résultat vide. Il transmet la recherche et les filtres au serveur :

| Action | Requête correspondante |
| --- | --- |
| Lire les recettes | `GET /api/v1/recipes` |
| Chercher « poulet » | `GET /api/v1/recipes?q=poulet` |
| Voir les recettes rapides | `GET /api/v1/recipes?quick=true` |
| Voir ses favoris | `GET /api/v1/recipes?favorites=true` |
| Lire une recette complète | `GET /api/v1/recipes/{id}` |

Rapides signifie **30 minutes au maximum, préparation et cuisson comprises**. Petit budget affiche encore « Disponible prochainement ».

Sans jeton, l’API permet de lire les recettes initiales. Avec une identité valide, elle ajoute les recettes personnelles de ce compte. Le mobile permet également cette consultation sans compte. Ajouter une recette, consulter ou modifier ses favoris et accéder au profil demande une connexion.

## 5. Créer une recette et enregistrer sa photo

Le parcours manuel passe par le choix d’ajout, le choix de saisie et le formulaire. Les choix IA sont visibles, mais leur traitement reste à développer.

```mermaid
flowchart TD
    A[AddRecipeScreen : choix d’ajout] --> M[ManualEntryScreen : choix de saisie]
    M --> F[RecipeEditorScreen : formulaire manuel]
    F --> C{Photo choisie ou URL déjà obtenue ?}
    C -->|Non| B[Création bloquée : ajouter une photo]
    B --> F
    C -->|Oui| P{Nouvelle photo locale ?}
    P -->|Oui| I[recipeImages.ts : préparer et envoyer à Storage]
    I --> URL[Obtenir l’URL publique]
    URL --> H[api.ts : POST /api/v1/recipes avec jeton]
    P -->|Non| H
    H --> V[FastAPI : identité et validation des données]
    V --> S[recipes/service.py : ingrédients et propriétaire]
    S --> D[(PostgreSQL : recette et liens ingrédients)]
    D --> R[Réponse avec la recette créée]
    R --> E[Afficher le détail]
```

Les responsabilités se répartissent ainsi :

1. Le formulaire recueille le nom, les portions, les durées, les ingrédients, les étapes, la difficulté et les étiquettes. Le nom est obligatoire : le bouton d’enregistrement reste désactivé s’il est vide ou ne contient que des espaces. À la création, une photo est également obligatoire ; les autres champs requis sont vérifiés avant l’enregistrement.
2. `IngredientPicker.tsx` aide à choisir un ingrédient du référentiel commun. La quantité se saisit dans un champ numérique séparé ; l’unité se choisit parmi trois boutons visibles : g, ml et unité. Aucune unité n’est présélectionnée pour un nouvel ingrédient. Les quantités doivent être positives et les unités en pièces entières. `recipeForm.ts` regroupe ces validations et les règles des badges.
3. La photo, obligatoire pour créer une recette, est préparée par `recipeImages.ts` : JPEG, côté maximal de 1 200 pixels et limite de 5 Mo. Son envoi intervient à l’enregistrement.
4. `api.ts` transmet le formulaire à FastAPI avec le jeton.
5. Le backend exige une URL de photo HTTPS valide à la création, valide les autres champs et vérifie que les ingrédients existent en base. Il déduit le propriétaire de l’identité authentifiée.
6. Le service enregistre la recette et ses liens vers les ingrédients dans une transaction PostgreSQL, puis renvoie le résultat.

**L’image et la recette sont enregistrées dans deux services différents.** Storage reçoit le fichier ; PostgreSQL conserve son URL dans `recipe.image_url`. Si l’envoi de l’image réussit mais que la recette ne peut pas être enregistrée, un fichier inutilisé peut rester dans Storage.

Les photos du bucket `recipes-images` sont publiques dans ce prototype. Les politiques Storage limitent les écritures à `users/<identifiant du compte>/`. En édition, retirer une photo enregistre `image_url: null` ; le fichier n’est pas automatiquement supprimé. Cette politique publique concerne les photos de recettes ; le futur parcours des reçus prévoit un stockage privé.

### Modifier, supprimer et mettre en favori

| Demande | Route | Règle principale |
| --- | --- | --- |
| Créer | `POST /api/v1/recipes` | Associer au compte authentifié |
| Modifier | `PUT /api/v1/recipes/{id}` | Vérifier le propriétaire |
| Supprimer | `DELETE /api/v1/recipes/{id}` | Vérifier le propriétaire |
| Ajouter un favori | `PUT /api/v1/recipes/{id}/favorite` | La recette doit être accessible au compte |
| Retirer un favori | `DELETE /api/v1/recipes/{id}/favorite` | Retirer seulement le favori de ce compte |

Les recettes initiales restent communes et ne peuvent pas être modifiées par les utilisateurs. Les favoris sont personnels, y compris lorsqu’ils concernent une recette initiale.

## 6. Pourquoi le backend contient plusieurs fichiers par domaine

Le backend est une seule application FastAPI, organisée par domaines. Cette séparation permet de retrouver une règle sans parcourir tout le serveur.

```mermaid
flowchart LR
    H[Requête HTTP] --> F[FastAPI : routage et dépendances]
    F --> V[schemas.py : format des données]
    F --> A[security.py : identité]
    F --> R[router.py : opération demandée]
    V -.-> R
    A -.-> R
    R --> S[service.py : règles métier]
    S --> Q[SQLAlchemy et database.py]
    M[models.py : représentation des tables] -.-> Q
    Q <--> D[(PostgreSQL)]
```

Ce schéma présente les responsabilités. La validation et les dépendances sont exécutées par FastAPI avant l’appel au traitement de la route ; les fichiers ne forment pas une suite d’étapes exécutées ligne par ligne.

| Fichier | Utilité et lien avec les autres |
| --- | --- |
| [main.py](backend/app/main.py) | Crée l’application, ajoute les routeurs et initialise les ressources au démarrage |
| [config.py](backend/app/config.py) | Lit les paramètres, notamment depuis `backend/.env` et l’environnement |
| [security.py](backend/app/security.py) | Fournit l’identité vérifiée aux routes protégées |
| [database.py](backend/app/database.py) | Configure le moteur PostgreSQL et fournit une session SQLAlchemy par requête |
| [recipes/router.py](backend/app/recipes/router.py) | Associe les routes HTTP aux opérations sur les recettes |
| [recipes/schemas.py](backend/app/recipes/schemas.py) | Définit les champs acceptés et retournés, avec leur validation |
| [recipes/service.py](backend/app/recipes/service.py) | Applique la visibilité, les contrôles de propriétaire, les écritures et les favoris |
| [recipes/models.py](backend/app/recipes/models.py) | Représente les tables `recipe`, `recipe_ingredient` et `favorite` |
| [accounts/router.py](backend/app/accounts/router.py) | Expose l’identité et la lecture/modification du profil minimal |
| [accounts/service.py](backend/app/accounts/service.py) | Assure notamment la création du profil applicatif si nécessaire |

**SQLAlchemy** permet de construire les requêtes et de manipuler les données depuis Python. **Psycopg** est le pilote qui communique avec PostgreSQL. **Pydantic** valide les formats échangés par l’API. Ces outils remplissent des rôles complémentaires.

## 7. Quelles données sont conservées dans Supabase ?

Auth gère les comptes dans son propre schéma. Les tables applicatives décrivent ensuite les profils, les recettes et leurs relations.

```mermaid
flowchart TD
    A[auth.users : identité Supabase] -->|Même identifiant de compte| P[profile : profil applicatif]
    P -->|owner_id pour les recettes personnelles| R[recipe : nom, portions, étapes et URL image]
    R -->|recipe_id| RI[recipe_ingredient : quantité, unité et position]
    I[ingredient : référentiel commun] -->|ingredient_id| RI
    P -->|user_id| F[favorite : association compte et recette]
    R -->|recipe_id| F
    R -.->|image_url| S[Fichier dans Storage]
```

Une recette contient plusieurs lignes `recipe_ingredient`. Chaque ligne relie la recette à un ingrédient et porte la quantité nécessaire. Un même ingrédient peut ainsi servir dans plusieurs recettes.

Les étapes sont conservées dans un champ JSON de `recipe`. Le lien `image_url` est une URL de fichier ; ce n’est pas une clé étrangère PostgreSQL vers Storage.

Pour les recettes initiales, `owner_id` est nul et `seed_key` identifie la recette importée. Pour une recette personnelle, `owner_id` référence le profil du propriétaire.

Le catalogue et les circulaires disposent aussi de tables :

```mermaid
flowchart LR
    I[ingredient : besoin de cuisine] -->|ingredient_id| O[product_offer : produit, magasin, format et prix]
    C[category : rayon alimentaire] -->|category_id| O
    F[circular : magasin, dates et nombre de pages] -.->|storage_prefix| S[Pages JPEG dans Storage]
```

`product_offer` conserve le prix de base, le prix promotionnel éventuel, les dates, la source et, depuis la migration `0007`, le lien de la photo du produit et sa provenance (`image_url`, `image_source`). Un nouvel import actualise le produit de même identifiant ; cette table ne conserve pas encore l’historique des prix. `circular` garde une seule circulaire par magasin et les informations nécessaires pour retrouver ses images dans le bucket public `circulars`.

### Ingrédient et produit commercial : quelle différence ?

Un ingrédient décrit un besoin de cuisine, par exemple une tomate fraîche. Un produit décrit ce qu’un magasin vend, avec son format, sa source et son prix relevé.

```mermaid
flowchart LR
    R[Recette avec tomates] --> L[recipe_ingredient : quantité nécessaire]
    L --> I[ing_tomate_fraiche : ingrédient commun]
    I --> A[Fiche produit Maxi]
    I --> B[Fiche produit Metro]
    I --> C[Fiche produit Super C]
    A -.-> X[À développer : choix selon formats, prix et contraintes]
    B -.-> X
    C -.-> X
```

Le référentiel commun contient **31 ingrédients et 93 fiches produits**. Les clés `ing_…` permettent aux recettes et au catalogue de désigner le même ingrédient. Les identifiants propres aux magasins ne suffisent pas : un même numéro peut désigner deux aliments différents selon la source.

Les correspondances sont explicites et restent à vérifier selon les produits. Relier deux fiches à un ingrédient commun ne prouve pas que leurs formats ou leurs qualités sont interchangeables.

## 8. Pourquoi certaines routes lisent encore des JSON

Le raccordement à PostgreSQL avance par étapes. Le référentiel des ingrédients existe déjà en base pour les relations des recettes, mais sa route HTTP lit encore le catalogue JSON commun.

| Données ou route | Source utilisée actuellement |
| --- | --- |
| `/api/v1/recipes` et détail | PostgreSQL, relu à chaque requête |
| Profil et favoris | PostgreSQL |
| `/api/v1/ingredients` | Catalogue JSON commun chargé au démarrage |
| `/api/v1/offers` et détail | JSON par défaut, ou PostgreSQL avec `OFFERS_SOURCE=database` |
| `/api/v1/circulars` | PostgreSQL pour les informations ; Storage pour les images des pages |
| `/catalog` et `/catalog/offers` | Ancien export choisi avec `CATALOG_IMPORT_PATH` |
| Photos de recettes et pages des circulaires | Supabase Storage |
| Photos des produits | Serveurs images des magasins ; l’API transmet leur URL |

[common/public_data.py](backend/app/common/public_data.py) prépare les données exposées depuis le JSON ou les offres en base. [common/public_router.py](backend/app/common/public_router.py) fournit les routes des ingrédients, des offres et des circulaires.

```mermaid
flowchart TD
    M[Mobile : demander les offres] --> A[FastAPI]
    A --> C{OFFERS_SOURCE vaut database ?}
    C -->|Oui| D[(PostgreSQL : product_offer)]
    C -->|Non| J[Catalogue JSON chargé au démarrage]
    D --> R[Réponse au même format JSON]
    J --> R
    R --> M
```

Le choix de source se fait au démarrage du serveur. Le mobile utilise la même route dans les deux cas. Les offres sont évaluées à la date du jour à Toronto, ou à la date fournie avec `on_date`. `promotion_only=true` conserve uniquement les promotions déclarées dont les dates permettent de confirmer qu’elles sont actives.

Le fichier commun par défaut est [data/catalog/baseCommune/ingredients.json](data/catalog/baseCommune/ingredients.json). Modifier ce fichier demande un redémarrage du serveur pour ses lectures HTTP. Modifier le JSON des recettes initiales ne change pas directement les recettes déjà en base : celles-ci passent par une commande d’import explicite.

Une panne PostgreSQL produit une erreur sur les routes qui en dépendent : recettes, profils, circulaires et offres lorsque la source choisie est la base. Elles ne basculent pas silencieusement sur une copie JSON. Le catalogue commun reste nécessaire, notamment pour vérifier les identifiants d’ingrédients dans la liste des offres. `/health` indique que le serveur répond ; `/health/db` vérifie la connexion par `SELECT 1`, sans garantir la présence de toutes les tables.

### Consulter les promotions

[PromotionsScreen.tsx](mobile/app/PromotionsScreen.tsx) demande les offres actives avec `GET /api/v1/offers?promotion_only=true&limit=100`. La recherche par nom et le filtre Maxi, Metro ou Super C sont ensuite appliqués dans le mobile. Les cartes sont triées par pourcentage de rabais décroissant et ouvrent le détail de l’offre.

Le détail présente le prix, le format, le prix par unité lorsque le format est reconnu, les dates et le lien vers le site du magasin. « Ajouter à la liste » affiche encore un message d’attente. Le chargement actuel porte sur les 100 premières offres ; les pages suivantes ne sont pas récupérées par cet écran.

Le prix affiché est `promo_price.amount` lorsqu’il est renseigné, sinon `price.amount`. Le pourcentage de rabais est calculé seulement si les deux prix sont strictement positifs et que le prix promotionnel est inférieur au prix de base. Les conversions d’affichage couvrent g, kg, lb, ml, L et les lots en unités ; elles ne constituent pas encore le moteur de calcul des besoins ou des listes.

### Photos des produits : du fichier source à l’écran

Depuis les ajouts des 29–30 octobre, les cartes Promos et leur détail affichent la photo du produit. Les 93 fiches du catalogue commun contiennent actuellement un lien d’image, soit 31 par enseigne. Ces liens pointent vers les serveurs images des magasins ; les fichiers ne sont ni copiés dans Supabase Storage ni servis par FastAPI.

```mermaid
flowchart TD
    J[produits.json des trois magasins : ImageUrl et ImageSource] --> B[build_common_catalog.py : valider et assembler]
    B --> C[Catalogue commun : image_url et image_source]
    C --> Q[Lecture JSON par FastAPI]
    C --> I[import_offers.py]
    I --> D[(PostgreSQL : product_offer)]
    D --> P[Lecture PostgreSQL par FastAPI]
    Q --> A[API offres : URL de la photo et provenance]
    P --> A
    A --> M[ProductImage dans la carte et le détail]
    S[Serveurs images des magasins] -->|Téléchargement direct de l’image| M
    M --> E{Lien présent et chargement réussi ?}
    E -->|Oui| V[Afficher la photo sans la recadrer]
    E -->|Non| F[Afficher une icône de panier]
```

Les champs sont facultatifs : un ancien fichier sans photo reste accepté. L’assembleur vérifie qu’un lien renseigné commence par `https://` et refuse le champ `ImageSource` seul sans champ `ImageUrl`. La migration ajoute aussi une contrainte HTTPS en base. Ces contrôles ne vérifient ni que le lien répond ni que la photo représente le bon produit.

Les lectures JSON et PostgreSQL exposent les mêmes champs dans la liste et le détail des offres. Les contrats exportés dans `backend/contracts/v1/` et le type `Offer` du mobile les incluent. L’identifiant public `offer_…` est calculé sans les champs de photo : changer uniquement l’image ou sa provenance ne change donc pas cet identifiant. Une modification des autres données de l’offre peut le changer.

[ProductImage.tsx](mobile/components/ProductImage.tsx) utilise l’image distante et affiche une icône si l’URL manque ou si le chargement échoue. Le détail indique aussi le magasin comme source de la photo lorsque l’URL est présente. La disponibilité des photos dépend ainsi du réseau et des serveurs des magasins, indépendamment de celle des données de prix.

### Trouver une recette avec les promos

[CookWithPromosScreen.tsx](mobile/app/CookWithPromosScreen.tsx) réutilise les promotions et charge les recettes accessibles au compte, puis leur détail pour connaître les ingrédients.

```mermaid
flowchart TD
    P[Promotions actives chargées] --> O[Retenir une offre par ingrédient]
    R[Recettes initiales et personnelles accessibles] --> D[Lire leurs ingrédients]
    O --> C[Relier les offres aux recettes par ingredient_id]
    D --> C
    C --> T[Garder les recettes avec au moins un ingrédient en promo]
    T --> L[Classer par nombre d’ingrédients en promo]
    L --> V[Afficher les recettes et ouvrir leur détail]
```

Pour chaque ingrédient, le code retient l’offre au prix affiché le plus bas parmi celles chargées. Cette comparaison porte sur le prix du produit, sans ajustement aux formats ou aux quantités de la recette. Le classement ne calcule donc ni un coût total ni le panier le moins cher. Il fonctionne sans IA et reste distinct du filtre « Petit budget », encore à développer.

### Calendrier et repas enregistrés

Le calendrier ajouté depuis `main` le 1er novembre utilise la migration
`0008_meal_plan`. Un compte connecté peut consulter une semaine, choisir une
recette ou une note, ajuster les portions, déplacer, dupliquer ou retirer un
repas, et marquer des restes de recette. Le mobile passe par les routes
`/api/v1/plans` ; le backend filtre les entrées par propriétaire.

```mermaid
flowchart LR
    M[CalendarScreen : semaine et actions] --> A[API plans : identité et validation]
    A --> S[planning/service.py : repas du compte]
    S --> D[(meal_plan_entry)]
    R[(recipe : nom et photo courants)] --> S
    D --> S
    S --> A
    A --> M
```

Le nom et la photo viennent de la recette courante. La suppression d’une
recette retire les repas qui la référencent ; la suppression du compte retire
ses repas. Ce fonctionnement ne fournit pas encore l’historique stable par
instantanés prévu pour les anciennes semaines. Les listes et le calcul
économique restent à développer. Voir le [guide du calendrier](backend/docs/PLANNING.md)
pour l’installation, les routes, les limites et les essais sur appareil.

## 9. Migrations et imports : deux opérations différentes

**Une migration modifie la structure des tables. Un import remplit les tables avec des données.** Alembic est la seule chaîne de migrations applicatives retenue.

```mermaid
flowchart LR
    A[Fichiers backend/alembic/versions] --> B[Commande Alembic]
    B -->|Créer ou modifier les tables| D[(PostgreSQL)]
    J[JSON des ingrédients, recettes et offres] --> C[Commandes d’import]
    C -->|Insérer les données selon les règles de rejeu| D
    F[FastAPI et SQLAlchemy] <-->|Lire et modifier les données métier| D
```

| Migration | Apport |
| --- | --- |
| `0001_create_ingredient.py` | Référentiel `ingredient` |
| `0002_create_recipes.py` | Tables `recipe` et `recipe_ingredient` |
| `0003_accounts_and_ownership.py` | Profils, propriété et favoris |
| `0004_recipe_metadata.py` | Difficulté et étiquettes |
| `0005_catalog_offers.py` | Tables `category` et `product_offer` |
| `0006_circulars.py` | Table `circular` |
| `0007_product_images.py` | URL et provenance des photos dans `product_offer`, avec contrainte HTTPS |
| `0008_meal_plan.py` | Repas privés dans `meal_plan_entry`, liés à une recette ou une note |

Les commandes se lancent depuis la racine, après configuration du serveur :

```bash
python -m alembic -c backend/alembic.ini upgrade head
python -m backend.cli.import_ingredients
python -m backend.cli.import_recipes
python -m backend.cli.import_offers
```

L’import des ingrédients peut actualiser le référentiel sans supprimer les éléments absents du fichier. L’import des recettes conserve les recettes identiques et annule sa transaction en cas de contenu différent, afin de préserver les corrections existantes. Les dix recettes initiales constituent un jeu de départ ; la base peut accueillir d’autres recettes.

L’import des offres valide le catalogue, puis insère ou actualise les catégories et les produits dans une transaction. Il exige que les ingrédients existent déjà en base et ne supprime pas les offres absentes du fichier. Modifier les fichiers de prix demande donc de reconstruire le catalogue commun et de relancer cet import pour les lectures PostgreSQL.

Sur une base déjà à la migration `0006`, `upgrade head` ajoute les colonnes de photo sans remplir les anciennes lignes : elles restent à `NULL` jusqu’à l’import des offres enrichies. Il faut appliquer `0007` avant d’utiliser les lectures PostgreSQL du code actuel ; disposer du fichier de migration dans Git ne prouve pas qu’il a été appliqué sur la base distante.

FastAPI ne lance automatiquement ni ces migrations, ni ces imports. Le guide [MIGRATIONS.md](backend/docs/MIGRATIONS.md) détaille les migrations et les imports initiaux ; le [guide backend](backend/README.md#promos-et-circulaires-de-la-semaine) décrit la mise à jour des offres et des circulaires.

## 10. D’où viennent les prix et les reçus ?

Ces outils fonctionnent actuellement en ligne de commande. Ouvrir l’application ou consulter une offre ne lance aucune collecte externe.

### Catalogue et prix

```mermaid
flowchart TD
    A[Apify : collecte Maxi ou capture à rejouer] --> C[ingest_catalog.py]
    C --> N[Normalisation et contrôles du catalogue]
    N --> J[Captures et exports JSON Maxi]
    J --> F[Fichiers regroupés Maxi]
    E[Échantillons JSON Metro et Super C] --> B[build_common_catalog.py]
    F --> B
    M[ingredient_mapping.json : correspondances explicites] --> B
    B --> K[Catalogue commun dans data/catalog/baseCommune]
    K --> P[FastAPI : routes ingrédients et offres]
    K --> I[import_ingredients.py]
    I --> D[(PostgreSQL : ingrédients, catégories et offres)]
    K --> O[import_offers.py]
    O --> D
    D -->|Offres si OFFERS_SOURCE vaut database| P
```

Les flèches résument le parcours des données ; certaines préparations sont des étapes distinctes, à lancer ou à vérifier séparément.

| Fichier ou dossier | Utilité |
| --- | --- |
| [price_sources/apify_loblaws.py](backend/app/price_sources/apify_loblaws.py) | Appeler le fournisseur Apify pour Maxi |
| [catalog/apify_command.py](backend/app/catalog/apify_command.py) | Préparer collecte, reprise ou rejeu |
| [catalog/apify_batch.py](backend/app/catalog/apify_batch.py) | Répartir les recherches et leur budget |
| [catalog/apify_ingestion.py](backend/app/catalog/apify_ingestion.py) | Transformer les réponses en catalogue |
| [catalog/common_catalog.py](backend/app/catalog/common_catalog.py) | Assembler les trois enseignes selon la correspondance fournie |
| [catalog/common_schemas.py](backend/app/catalog/common_schemas.py) | Valider les structures du catalogue commun |
| [backend/config/catalog/](backend/config/catalog/) | Ingrédients recherchés, requêtes, lots et succursale |
| [data/catalog/](data/catalog/) | Captures, fichiers regroupés et catalogue commun |

Apify est retenu pour la collecte Maxi. Metro et Super C ont des échantillons JSON ; leur collecte web avec un modèle IA reste à développer et à évaluer. Pour actualiser les promotions, la procédure actuelle prévoit aussi de vérifier les produits dans les circulaires et de reporter les prix dans les fichiers `produits.json`, en respectant le même produit et le même format. Le catalogue commun est ensuite reconstruit avec `python -m backend.cli.build_common_catalog`, puis importé avec `python -m backend.cli.import_offers`.

Les captures ne garantissent pas le prix ni le stock actuels en magasin. Épiceries.ca et l’extraction automatique des prix depuis les PDF restent des pistes abandonnées. L’affichage des circulaires PDF dans l’application est un parcours distinct, décrit ci-dessous.

### Actualiser les prix et les photos des trois magasins

Les fichiers sources utilisés pour assembler le catalogue sont :

- `data/catalog/maxi/data_final/produits.json` ;
- `data/catalog/metro/produits.json` ;
- `data/catalog/superc/produits.json`.

Dans ces fichiers, `Prix` désigne le prix de base et `PrixPromo` le prix promotionnel éventuel, avec `IsPromotion`, les dates de validité et `DateRecuperation`. `ImageUrl` désigne la photo ; `Url` reste la page du produit. L’assemblage transforme ces noms en champs communs tels que `price`, `promo_price`, `valid_from`, `valid_to`, `retrieved_at` et `image_url`.

Le changement du 30 octobre actualise notamment dix promotions pour la période du **29 octobre au 4 novembre 2026**. Le catalogue conserve aussi deux promotions avec d’autres périodes et des relevés plus anciens hors promotion : tous les produits n’ont donc pas été relevés à nouveau le 30 octobre. Les dates de chaque fiche font foi. Un prix de base absent reste inconnu ; il ne faut pas l’inventer pour afficher un pourcentage de rabais.

```mermaid
flowchart TD
    V[Vérifier produit, format, prix et dates dans la source] --> J[Mettre à jour les produits.json concernés]
    J --> B[Reconstruire le catalogue commun]
    B --> S{Source des offres du serveur ?}
    S -->|JSON| R[Redémarrer FastAPI pour relire le catalogue]
    S -->|PostgreSQL| M[Appliquer les migrations nécessaires]
    M --> I[Importer les offres dans PostgreSQL]
    R --> A[Ouvrir de nouveau l’onglet Promos]
    I --> A
    A --> F[Le backend filtre les offres actives à la date demandée]
```

Après la vérification et la mise à jour des fichiers, les commandes suivantes se lancent depuis la racine, avec l’environnement Python activé :

```bash
python -m backend.cli.build_common_catalog
```

Pour le chemin PostgreSQL, appliquer les migrations puis importer :

```bash
python -m alembic -c backend/alembic.ini upgrade head
python -m backend.cli.import_offers
```

Les offres en base sont relues à chaque requête ; un changement de `OFFERS_SOURCE` exige toutefois un redémarrage du serveur. La liste des ingrédients reste chargée depuis le JSON au démarrage. Le mobile recharge les promotions lorsqu’on revient dans l’onglet.

`ON_DATE` dans [components/promos.ts](mobile/components/promos.ts) vaut actuellement `undefined` : le backend utilise la date du jour à Toronto. Une date explicite sert à essayer les offres du catalogue pour cette date, sans restaurer un historique des anciens prix. Après expiration, une promotion disparaît de la liste active ; importer une circulaire plus récente ne suffit pas à actualiser les offres.

### Préparer et consulter les circulaires

Les PDF sont téléchargés manuellement dans `data/circulars/`. La commande [import_circulars.py](backend/cli/import_circulars.py) prépare leur affichage : elle convertit chaque page en JPEG, envoie les images dans Storage, puis enregistre les informations de la circulaire dans PostgreSQL.

```mermaid
flowchart TD
    P[PDF téléchargé pour un magasin] --> C[import_circulars.py : convertir les pages en JPEG]
    C --> S[Storage : bucket public circulars]
    C --> D[(PostgreSQL : table circular)]
    M[Mobile : ouvrir Circulaires] --> A[GET /api/v1/circulars]
    D --> A
    A --> L[Dates et liens des pages]
    L --> V[Afficher la circulaire du magasin]
    S -->|Images téléchargées directement| V
```

Après création du bucket public `circulars` et configuration de `SUPABASE_SECRET_KEY` côté serveur, un import se lance ainsi :

```bash
python -m backend.cli.import_circulars --retailer maxi --from 2026-10-22 --to 2026-10-28
```

Le fichier attendu ici est `data/circulars/maxi.pdf`. Les mêmes options existent pour `metro` et `superc`. Sans dates explicites, le script prend la semaine du jeudi au mercredi en cours. Il remplace la ligne du magasin et supprime les anciennes images après l’enregistrement de la nouvelle circulaire. Ce parcours conserve la circulaire courante, pas un historique.

Dans le mobile, [CircularsScreen.tsx](mobile/app/CircularsScreen.tsx) présente les magasins, les couvertures et les dates. [CircularScreen.tsx](mobile/app/CircularScreen.tsx) affiche les pages et ouvre l’image d’une page lorsqu’on la touche. Une circulaire terminée est signalée ; elle n’est pas automatiquement masquée. **L’import des images n’extrait aucun prix et ne met pas à jour les offres.**

### Lecture locale des reçus et pilote PC Express

```mermaid
flowchart LR
    P[Photo de reçu] --> O[ocr.py : reconnaître le texte]
    O --> R[parser.py et rules : reconstruire les articles]
    R --> V[validation.py : contrôler les montants]
    V --> J[JSON du reçu à vérifier]
    J --> M[Pilote Maxi : préparer les correspondances]
    U[Liens produits renseignés] --> M
    M --> W[PC Express : actualiser les fiches identifiées]
    J -.-> F[À développer : confirmation dans le mobile et observations de prix]
```

L’OCR utilise Apple Vision sur Mac ou Tesseract + OpenCV. Le chemin Windows et les reçus Super C restent à valider. Des sommes cohérentes ne garantissent pas que tous les articles ont été correctement reconnus.

Le pilote PC Express est un traitement complémentaire testé sur cinq produits Maxi. [match_maxi_receipts.py](backend/cli/match_maxi_receipts.py) prépare les correspondances puis actualise les produits dont le lien est renseigné ; [web_matching.py](backend/app/receipts/web_matching.py) porte les traitements et [pcx_products.py](backend/app/price_sources/pcx_products.py) récupère les fiches. Ce pilote ne fait pas partie du parcours HTTP des recettes.

Les commandes, résultats et limites sont expliqués dans [RECEIPTS.md](backend/docs/RECEIPTS.md) et [PCX_PILOT.md](backend/docs/PCX_PILOT.md). La future contribution de prix sera facultative et nécessitera une correction puis une confirmation de l’utilisateur.

## 11. Retrouver les fichiers utiles dans le dépôt

### Côté mobile

| Fichier ou dossier | Utilité et lien avec les autres |
| --- | --- |
| [App.tsx](mobile/App.tsx) | Assemble AuthProvider, les cinq onglets et les navigations Recettes et Promos |
| [app/AuthScreen.tsx](mobile/app/AuthScreen.tsx) | Inscription et connexion à la demande, avec retour au mode visiteur |
| [components/AccountRequired.tsx](mobile/components/AccountRequired.tsx) | Protection des écrans personnels sans bloquer la consultation publique |
| [app/ProfileScreen.tsx](mobile/app/ProfileScreen.tsx) | Profil, déconnexion et suppression du compte |
| [app/CalendarScreen.tsx](mobile/app/CalendarScreen.tsx) | Semaines et actions sur les repas personnels |
| [components/AddMealSheet.tsx](mobile/components/AddMealSheet.tsx) et [components/MealActionsSheet.tsx](mobile/components/MealActionsSheet.tsx) | Choix de recette ou note, portions, déplacement, duplication et restes |
| [app/RecipeListScreen.tsx](mobile/app/RecipeListScreen.tsx) | Recherche, filtres, pagination et cartes |
| [app/RecipeDetailScreen.tsx](mobile/app/RecipeDetailScreen.tsx) | Détail, favoris et actions sur ses recettes |
| [app/AddRecipeScreen.tsx](mobile/app/AddRecipeScreen.tsx) | Choix entre les trois modes d’ajout |
| [app/ManualEntryScreen.tsx](mobile/app/ManualEntryScreen.tsx) | Choix formulaire ou texte ; le texte IA reste prévu |
| [app/RecipeEditorScreen.tsx](mobile/app/RecipeEditorScreen.tsx) | Création manuelle avec photo obligatoire ; modification des recettes existantes |
| [app/PromotionsScreen.tsx](mobile/app/PromotionsScreen.tsx) | Promotions actives, recherche et filtre par magasin |
| [app/PromoDetailScreen.tsx](mobile/app/PromoDetailScreen.tsx) | Prix, format, dates et lien vers le produit |
| [app/CookWithPromosScreen.tsx](mobile/app/CookWithPromosScreen.tsx) | Recettes classées par nombre d’ingrédients en promotion |
| [app/CircularsScreen.tsx](mobile/app/CircularsScreen.tsx) et [app/CircularScreen.tsx](mobile/app/CircularScreen.tsx) | Choix du magasin et lecture des pages de la circulaire |
| [components/promos.ts](mobile/components/promos.ts) | Chargement des promos et circulaires, affichage des prix, formats et dates |
| [components/ProductImage.tsx](mobile/components/ProductImage.tsx) | Photo distante du produit et icône de remplacement en cas d’absence ou d’erreur |
| [components/](mobile/components/) | Champs, boutons, sélecteur d’ingrédients et affichage des images réutilisés par les écrans |
| [services/api.ts](mobile/services/api.ts) | Requêtes FastAPI, jeton, délai réseau et gestion des erreurs |
| [services/recipeImages.ts](mobile/services/recipeImages.ts) | Galerie, préparation du JPEG et envoi à Storage |
| [services/recipeForm.ts](mobile/services/recipeForm.ts) | Règles de quantités et badges du formulaire |
| [types/api.ts](mobile/types/api.ts) | Types TypeScript des données HTTP |
| [types/navigation.ts](mobile/types/navigation.ts) | Types des écrans et paramètres de navigation |
| [app.json](mobile/app.json) | Configuration Expo et schéma de lien `optimeal` |
| [package.json](mobile/package.json) et `package-lock.json` | Commandes npm et versions des dépendances |

Les types TypeScript aident le développeur à utiliser les données correctement. Le backend doit aussi valider les entrées reçues, indépendamment des vérifications du formulaire.

### Guides, configuration et vérifications

| Emplacement | Rôle |
| --- | --- |
| [README.md](README.md) | Présentation, état du projet, installation et structure |
| [backend/docs/](backend/docs/) | Guides des contrats, de la base, de l’authentification, des images, des prix et des reçus |
| [backend/contracts/v1/](backend/contracts/v1/) | Exports OpenAPI, JSON Schema et exemples pour coordonner backend et mobile |
| [backend/cli/](backend/cli/) | Commandes d’import, de collecte, d’OCR et d’export des contrats |
| [backend/app/catalog/models.py](backend/app/catalog/models.py) | Tables des ingrédients, catégories, offres et circulaires |
| [backend/app/catalog/offer_import.py](backend/app/catalog/offer_import.py) | Validation et import des catégories et offres |
| [backend/alembic/versions/0007_product_images.py](backend/alembic/versions/0007_product_images.py) | Ajout des colonnes de photo ; migration à appliquer avant les lectures d’offres PostgreSQL du code actuel |
| [backend/app/catalog/circulars.py](backend/app/catalog/circulars.py) | Conversion PDF en images, accès Storage et préparation des liens des pages |
| [backend/cli/import_offers.py](backend/cli/import_offers.py) et [backend/cli/import_circulars.py](backend/cli/import_circulars.py) | Mise à jour des offres et des circulaires depuis le terminal |
| [backend/config/storage/recipe_images.sql](backend/config/storage/recipe_images.sql) | Politiques du bucket d’images, appliquées par la commande dédiée ; séparées des migrations applicatives |
| [backend/tests/](backend/tests/) | Tests des règles, routes, imports, autorisations et traitements de données |
| [mobile/tests/](mobile/tests/) | Tests du service photo et des règles du formulaire |
| [.github/workflows/backend.yml](.github/workflows/backend.yml) | Tests backend avec PostgreSQL temporaire dans la CI |
| [.github/workflows/mobile.yml](.github/workflows/mobile.yml) | Vérification TypeScript et export des bundles iOS/Android |
| [.github/workflows/docs.yml](.github/workflows/docs.yml) | Construction du site et publication depuis `main` |
| [docs/](docs/) et [zensical.toml](zensical.toml) | Sources et configuration du site de suivi académique |
| `site/` | Sortie générée par Zensical, à ne pas modifier manuellement |
| `tools/` | Consignes, architecture, décisions et tâches locales, actuellement ignorées par Git |
| [requirements.txt](requirements.txt) | Dépendances Python du backend, des tests et du site |

Les fichiers `__init__.py` identifient les packages Python. Un fichier présent peut encore être un emplacement réservé : c’est notamment le cas des domaine des listes et de `backend/tests/conftest.py`.

## 12. Configuration : comment les adresses relient les composants

| Configuration | Utilisation |
| --- | --- |
| `mobile/.env` : `EXPO_PUBLIC_API_URL` | Adresse de FastAPI accessible depuis l’appareil |
| `mobile/.env` : `EXPO_PUBLIC_SUPABASE_URL` | Adresse du projet Supabase pour Auth et Storage |
| `mobile/.env` : `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clé publique du client Supabase |
| `backend/.env` : `DATABASE_URL` | Connexion PostgreSQL réservée au serveur |
| `backend/.env` : `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Vérification des jetons auprès de Supabase Auth |
| `backend/.env` : `SUPABASE_SECRET_KEY` | Import des circulaires et suppression de compte (Auth et photos) ; clé réservée au serveur |
| `backend/.env` : `OFFERS_SOURCE` | `database` pour lire les offres en base ; JSON par défaut |
| `COMMON_CATALOG_PATH` | Autre chemin éventuel pour le catalogue JSON commun |
| `CATALOG_IMPORT_PATH` | Export utilisé par les anciennes routes `/catalog` |

Les `.env.example` fournissent les noms à renseigner sans secrets réels. Les fichiers `.env` restent locaux. Les variables `EXPO_PUBLIC_…` sont distribuées au mobile : elles doivent contenir uniquement des valeurs publiques, jamais le mot de passe PostgreSQL ou une clé serveur privilégiée.

Le backend charge sa configuration au démarrage ; il faut le redémarrer après un changement. Il faut également redémarrer Expo après modification de la configuration mobile. Les commandes de collecte ont leurs propres options et peuvent demander des variables exportées dans le terminal ; voir leur guide.

Pour démarrer le backend accessible au téléphone, depuis la racine avec l’environnement Python activé :

```bash
python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8001
```

Dans un autre terminal, depuis `mobile/`, après installation et configuration de l’application de développement :

```bash
npm start -- --dev-client
```

Le [guide mobile](mobile/README.md) détaille la première compilation, la configuration Auth et les essais sur appareil.

### Appels depuis Expo Web et autorisations CORS

Le backend autorise désormais les origines `http://localhost:8081` et `http://127.0.0.1:8081` dans [main.py](backend/app/main.py). Une origine correspond au protocole, à l’hôte et au port de la page qui effectue l’appel. Le navigateur applique la règle CORS lorsque cette origine diffère de celle du backend.

```mermaid
sequenceDiagram
    participant W as Navigateur avec Expo Web sur le port 8081
    participant B as FastAPI sur le port 8001
    W->>B: Vérification préalable OPTIONS si nécessaire
    B-->>W: Origine et en-têtes autorisés par CORS
    W->>B: Requête API avec jeton pour les opérations protégées
    B-->>W: Réponse avec autorisation de lecture par le navigateur
```

Cette configuration permet les appels API depuis ces deux origines locales. Un autre port, une adresse IP du réseau ou un futur domaine web demande une adaptation de la liste. CORS ne remplace ni la connexion ni les contrôles de propriétaire et ne règle pas un problème de pare-feu ou d’URL inaccessible. Les applications natives iOS et Android ne sont pas soumises à cette restriction du navigateur. Cet ajout ne constitue pas une validation complète de l’application dans sa version web.

## 13. Ce qui fonctionne et le parcours encore à construire

Le 1er novembre 2026, Hamza a confirmé sur iOS le nom obligatoire pour activer l’enregistrement et la saisie de quantité séparée du choix de l’unité parmi g, ml et unité. Les essais Android de ces ajustements restent à effectuer.

| État au 1er novembre 2026 | Parcours |
| --- | --- |
| Confirmé sur iOS le 1er novembre ; Android à vérifier | Mode visiteur et connexion à la demande |
| Confirmé sur iOS le 1er novembre ; Android à vérifier | Photo obligatoire à la création d’une recette et suppression du compte |
| Confirmé sur iOS et Android le 27 octobre | Inscription, confirmation du courriel, connexion, session persistante et profil minimal |
| Confirmé sur iOS et Android | Consultation, recherche, Rapides, recettes manuelles et favoris ; séparation de deux comptes aussi vérifiée sur iPhone |
| Confirmé sur iOS et Android | Photo de galerie, hébergement Storage et URL enregistrée dans la recette |
| Outils locaux disponibles | Collecte Maxi, catalogue commun, OCR et pilote PC Express |
| Implémenté dans le code | Tables et import des catégories/offres ; choix de lecture JSON ou PostgreSQL |
| Confirmé sur iOS et Android | Consultation des promos, détail et recettes associées aux ingrédients en promotion |
| Import disponible, lecture confirmée sur iOS et Android | Circulaires en images dans Storage et consultation dans le mobile |
| Affichage confirmé sur iOS le 1er novembre ; Android à vérifier | Photos des produits dans les JSON, l’import PostgreSQL, les contrats API et les écrans Promos |
| Données locales actualisées le 30 octobre | Dix promotions du 29 octobre au 4 novembre ; d’autres relevés gardent leurs propres dates |
| Configuré dans le backend | CORS pour les deux origines locales Expo Web sur le port 8081 |
| À développer | Collecte web IA Metro/Super C |
| À développer | Modes IA des recettes, Petit budget et calcul des coûts |
| Confirmé sur Supabase et iOS le 1er novembre ; Android à vérifier | Calendrier privé et repas sauvegardés ; migration 0008 appliquée sur le projet Supabase selon la confirmation de Hamza |
| À développer | Historique stable par instantanés et listes modifiables par magasin |
| À développer | Confirmation des reçus dans le mobile, contributions et estimations de prix |
| À compléter | Scénarios d’erreur réseau et essais sur différentes tailles d’écran |

Le 27 octobre, Hamza a confirmé le fonctionnement des parcours comptes, recettes, photos et Promos sur iOS et Android. Son coéquipier a également vérifié ces parcours sur son téléphone Android. Les fonctionnalités encore prévues ci-dessous restent à développer.

Le 1er novembre 2026, Hamza a confirmé le fonctionnement sur iOS du mode visiteur, de la connexion à la demande, de la photo obligatoire à la création, des photos de produits dans Promos et de la suppression du compte. Cette confirmation générale ne constitue pas un résultat individuel pour chaque scénario d’erreur. Les nouveaux parcours restent à reproduire sur Android. La configuration CORS pour Expo Web n’est pas validée par ces essais iOS.

### Parcours cible : de la semaine de repas aux achats

Le calendrier enregistre désormais les repas, mais les instantanés et le
parcours jusqu’aux achats ne sont pas encore implémentés. Le schéma suivant
décrit cet objectif complet.

```mermaid
flowchart TD
    R[Choisir recettes, jours et portions] --> P[Sauvegarder un plan et ses instantanés]
    P --> Q[Calculer et regrouper les besoins compatibles]
    Q --> C[Relier les besoins aux produits et formats]
    D[Prix et offres valides à la date d’achat] --> C
    C --> O[Comparer selon budget et contraintes de magasins]
    O --> L[Sauvegarder une liste par magasin avec prix et incertitudes]
    L --> M[Cocher, remplacer ou retirer des articles]
    M --> V[Recalculer et conserver une nouvelle révision]
    V --> A[Effectuer les achats]
    A -.-> F[Facultatif : photo de reçu et confirmation des lignes]
    F -.-> E[Observations privées pouvant alimenter les estimations]
```

Les calculs de portions, conversions connues et prix seront effectués par le backend. Une unité incompatible ou un prix inconnu devra rester explicitement signalé. Une fourchette ne garantit pas le budget réel ; si certaines lignes ne sont pas estimables, la partie calculable devra être présentée comme un sous-total.

Les propositions IA devront être corrigées et confirmées avant sauvegarde. Les anciennes semaines devront conserver leurs recettes, portions et prix sous forme d’instantanés, même si les données courantes changent ensuite.

## 14. Un ordre de lecture pour explorer le code

Pour suivre un parcours sans lire tout le dépôt à la fois :

1. Ouvrir [App.tsx](mobile/App.tsx) pour repérer les onglets publics et les écrans réservés aux comptes.
2. Lire [AuthContext.tsx](mobile/context/AuthContext.tsx), puis [supabase.ts](mobile/services/supabase.ts), pour comprendre la session.
3. Suivre [RecipeListScreen.tsx](mobile/app/RecipeListScreen.tsx) vers [api.ts](mobile/services/api.ts) pour voir comment part une demande.
4. Repérer le routeur dans [main.py](backend/app/main.py), puis lire [recipes/router.py](backend/app/recipes/router.py).
5. Suivre l’opération dans [recipes/service.py](backend/app/recipes/service.py), avec [security.py](backend/app/security.py) pour l’identité.
6. Lire [recipes/models.py](backend/app/recipes/models.py) et [database.py](backend/app/database.py) pour comprendre la persistance.
7. Refaire le trajet avec [RecipeEditorScreen.tsx](mobile/app/RecipeEditorScreen.tsx) pour comprendre une écriture et l’envoi de photo.
8. Suivre [PromotionsScreen.tsx](mobile/app/PromotionsScreen.tsx) et [components/promos.ts](mobile/components/promos.ts) vers [common/public_router.py](backend/app/common/public_router.py) pour comprendre la lecture des offres.
9. Lire [CookWithPromosScreen.tsx](mobile/app/CookWithPromosScreen.tsx) pour retrouver le rapprochement entre recettes et promotions.
10. Suivre [import_circulars.py](backend/cli/import_circulars.py), puis les écrans Circulaires, pour comprendre le trajet des PDF jusqu’au téléphone.
11. Examiner ensuite les autres outils de catalogue et de reçus selon le besoin.

Pour suivre les ajouts récents, partir des champs `ImageUrl` et `ImageSource` d’un fichier `produits.json`, puis lire `common_catalog.py`, la migration `0007`, `offer_import.py`, `public_data.py` et enfin `ProductImage.tsx`. Ce trajet distingue l’enregistrement du lien et le téléchargement réel de la photo par le mobile.

Pour une lecture de recette, le trajet à retrouver dans le code est : **écran → client HTTP → route FastAPI → service → PostgreSQL → réponse JSON → écran**. Pour la connexion et les fichiers images, les branches directes vers Auth et Storage complètent ce trajet.

*Dernière mise à jour : 1er novembre 2026*

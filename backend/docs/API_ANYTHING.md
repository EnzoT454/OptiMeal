# Évaluer API Anything pour les prix et promotions d’OptiMeal

**Date de l’analyse : 14 novembre 2026**  
**Statut : exploration documentaire et lectures HTTP ; intégration non réalisée.**

Ce guide conserve l’analyse d’API Anything et prépare des essais reproductibles
sur Maxi, Metro, Super C et les circulaires présentées par Glouton. Il distingue
les observations effectuées, les hypothèses à vérifier et les développements
proposés. Les commandes d’apprentissage ci-dessous n’ont pas été exécutées
pendant cette analyse et ne constituent pas des connecteurs validés.

L’objectif est de savoir si l’outil permet d’obtenir des produits, formats,
prix et promotions suffisamment fiables pour alimenter le catalogue existant.
Le premier livrable attendu est un rapport sur un petit échantillon, avant
toute collecte régulière ou écriture dans la base partagée.

## 1. Conclusion et ordre des essais

API Anything mérite un prototype, sans remplacer immédiatement les sources
actuelles. L’ordre proposé est :

1. Vérifier l’installation et comprendre les résultats de l’outil.
2. Tester Metro sur une succursale et cinq produits.
3. Reproduire le protocole pour Super C.
4. Comparer une lecture Maxi à la collecte Apify existante.
5. Normaliser une capture réussie et la valider localement.
6. Envisager un import PostgreSQL contrôlé, puis une collecte régulière.

Glouton constitue une piste distincte : ses conditions encadrent explicitement
l’extraction systématique et l’alimentation d’un service concurrent. Obtenir
un accord écrit adapté au projet avant d’en faire une source automatisée.

Le fait qu’une page ou une requête soit accessible ne démontre ni la permission
de réutiliser ses données, ni leur exactitude, ni leur stabilité.

## 2. Fonctionnement et limites de l’outil

API Anything observe les requêtes effectuées par le frontend d’un site,
apprend une opération paramétrable puis essaie de la rejouer. Il peut utiliser
du HTTP direct ou un navigateur de secours. Il propose aussi une tentative de
réparation lorsque la requête apprise change.

L’outil n’est pas une API officielle des enseignes. Son apprentissage des
requêtes n’a pas besoin d’un LLM ; un agent peut néanmoins employer un modèle
pour choisir les opérations et interpréter leurs résultats.

| Mécanisme | Utilité | Ce qu’il ne garantit pas |
| --- | --- | --- |
| Recherche d’opérations | Trouver une opération locale ou communautaire | Sa disponibilité depuis notre réseau |
| Capture | Observer une page et ses requêtes | Que la réponse utile contient des prix |
| Apprentissage | Distinguer des paramètres à partir d’exemples | Que la succursale et tous les filtres sont respectés |
| Appel | Réutiliser une opération apprise | Que les données sont actuelles et complètes |
| Réparation | Essayer de réapprendre une requête devenue invalide | Une maintenance automatique toujours réussie |

Une réponse JSON peut contenir des suggestions de recherche, des données
publicitaires ou un accusé de réception plutôt qu’un catalogue. Un HTTP 200
ou `ok: true` n’est pas un critère suffisant : vérifier le contenu métier.

Si une circulaire fournit uniquement des images, API Anything peut aider à
retrouver les images, mais ne les transforme pas automatiquement en prix
structurés. L’OCR et la validation seraient alors un autre traitement.

Sources : [présentation](https://github.com/goodnight000/api-anything),
[référence](https://github.com/goodnight000/api-anything/blob/main/docs/REFERENCE.md).

## 3. Pages étudiées et observations du 14 novembre

### 3.1. URL de départ

| Source | Page |
| --- | --- |
| Glouton — Maxi | <https://www.glouton.app/fr/circulaire/5268-maxi-2026-11-12> |
| Glouton — Super C | <https://www.glouton.app/fr/circulaire/5267-super-c-2026-11-12> |
| Glouton — Metro | <https://www.glouton.app/fr/circulaire/5265-metro-2026-11-12> |
| Maxi | <https://www.maxi.ca/fr> |
| Metro | <https://www.metro.ca/fr> |
| Super C | <https://www.superc.ca/fr> |

### 3.2. Résultats observés

Les lectures ci-dessous ont été faites avec un outil web et des requêtes
HTTP simples. Aucun apprentissage API Anything ni capture de son navigateur
n’a été réalisé. Les résultats dépendent du réseau, du client, de la session
et du moment ; ils doivent être reproduits avant toute conclusion définitive.

| Page ou action | Observation | Limite de la conclusion |
| --- | --- | --- |
| Trois pages Glouton | HTTP 200, titres correspondant aux trois circulaires, application Nuxt et bloc `__NUXT_DATA__` présents | Le texte visible du HTML initial analysé ne contenait pas de liste de produits/prix ; le contenu complet du bloc de données et le chargement navigateur n’ont pas été établis |
| Accueil Maxi | HTTP direct : 403 Access Denied ; l’outil web a obtenu un accueil | Aucun accès automatisé reproductible démontré |
| Accueil Metro | HTTP 200, formulaire de recherche et choix de magasin présents | Ne prouve pas que les recherches ou fiches produits sont accessibles |
| Recherche Metro `filter=lait` | HTTP 403 | Cause exacte et résultat dans Chrome non déterminés |
| Accueil Super C | HTTP 200, formulaire de recherche et choix de magasin présents | Même limite que Metro |
| Recherche Super C `filter=lait` | HTTP 403 | Cause exacte et résultat dans Chrome non déterminés |
| Conditions Metro et Super C | Pages obtenues par HTTP | À relire à la date de chaque nouvelle campagne |

Les accueils marchands observés sélectionnaient Metro Queen Mary et Super C
St-Jacques. Ce sont des contextes affichés dans ces réponses, pas des succursales
choisies pour la collecte OptiMeal. Les deux sites demandent de sélectionner un
magasin pour afficher les produits disponibles et les prix actuels.

Les fichiers HTML de travail étaient dans `/tmp/optimeal-api-anything-audit/`.
Ce dossier temporaire n’est pas une archive durable ni une dépendance de ce
guide. Les futures campagnes doivent conserver leurs propres preuves datées.

### 3.3. Ce qui reste inconnu

- Présence d’opérations communautaires adaptées aux quatre domaines.
- Endpoints réellement utiles et schémas de leurs réponses.
- Fonctionnement d’API Anything sur ces pages depuis notre réseau.
- Besoin d’une session, transmission de la succursale et durée de validité.
- Couverture du catalogue, pagination et disponibilité des dates de promotion.
- Exactitude et stabilité sur plusieurs jours.
- Conditions de réutilisation applicables au projet pour chaque source.

## 4. Conditions d’accès et réutilisation

### Glouton

La section 7 des [conditions d’utilisation](https://www.glouton.app/fr/conditions-utilisation)
consultées interdit sans autorisation écrite l’extraction systématique des
analyses, historiques ou contenus par robot, script ou collecte organisée,
ainsi que certains usages de republication et d’alimentation d’un service concurrent.

Utiliser les liens comme références de consultation. Pour aller plus loin,
demander un accord précisant : objectif universitaire, champs nécessaires,
volume, fréquence, conservation, attribution, diffusion dans la démonstration
et éventuel partage public du jeu de données. Aucun contact n’a été envoyé
pendant l’analyse.

### Metro et Super C

Les conditions consultées réservent l’utilisation du site à un usage personnel
et non commercial et encadrent les reproductions non autorisées. Le caractère
universitaire du projet ne constitue pas à lui seul une autorisation de
collecte ou de republication.

- [Conditions Metro](https://www.metro.ca/conditions-utilisation)
- [Conditions Super C](https://www.superc.ca/conditions-utilisation)

### Maxi

Les conditions propres à la collecte envisagée restent à examiner ; cette
analyse ne conclut pas à une permission. Conserver Apify comme source retenue
pendant l’évaluation, avec les limites déjà décrites dans [APIFY.md](APIFY.md).

Pour tous les essais : ne pas modifier de panier, ne pas commander et ne pas
contourner les protections. Une connexion éventuelle est effectuée par
l’utilisateur dans son navigateur ; ne pas demander de mot de passe dans
l’agent ni copier de cookies dans les rapports ou le dépôt.

## 5. Préparer l’environnement

### 5.1. Prérequis et versions

API Anything documente Node.js 22.13 ou plus récent et un navigateur Chromium
pour l’apprentissage. La machine examinée disposait de Node 22.23.3 et de
Google Chrome. API Anything n’était pas présent comme commande globale dans
le PATH consulté ; cela ne constitue pas un inventaire de toutes les installations.

Avant les essais :

```bash
node --version
npm --version
npx -y api-anything --help
npx -y api-anything learn --help
```

Les commandes suivantes correspondent à la documentation officielle consultée
le 14 novembre. Le `package.json` de la branche `main` du projet affichait
0.4.0 ; cela ne prouve pas la version effectivement distribuée par npm au
moment d’un futur test. Consigner la version réellement exécutée et conserver
son aide. Une fois une version testée, utiliser explicitement cette version
dans les commandes reproductibles plutôt qu’une résolution variable.

### 5.2. Configuration Codex, facultative pour la CLI

Depuis un terminal, prévisualiser les changements :

```bash
npx -y api-anything setup --agents codex --no-share --local-only --dry-run
```

Puis appliquer la configuration souhaitée :

```bash
npx -y api-anything setup --agents codex --no-share --local-only
```

Redémarrer la session Codex pour charger les outils MCP. L’installation
configure l’environnement de l’agent ; elle ne modifie pas le backend OptiMeal.
Les commandes CLI restent utilisables sans connexion MCP à Codex.

Source : [installation officielle](https://github.com/goodnight000/api-anything/blob/main/INSTALL.md).

### 5.3. Mode local et catalogue communautaire

| Configuration | Effet documenté |
| --- | --- |
| `--no-share` | Désactive le partage des opérations et rapports ; les recherches peuvent encore consulter le catalogue |
| `--local-only` | Désactive les échanges avec le catalogue, recherches comprises |
| Appel d’un site marchand | Nécessite toujours un accès Internet au site, même en mode local |

Dans le mode recommandé pour le premier essai :

```bash
npx -y api-anything sites
```

Une absence locale n’indique pas une absence communautaire. Si l’on décide de
consulter le catalogue, vérifier l’aide de `setup` et changer explicitement
le réglage `local-only`, en conservant `--no-share` si souhaité. Les recherches
suivantes interrogent alors les opérations disponibles selon cette configuration :

```bash
npx -y api-anything search metro.ca
npx -y api-anything search superc.ca
npx -y api-anything search maxi.ca
npx -y api-anything search glouton.app
```

Lire les notes et paramètres de chaque résultat et vérifier son domaine réel.
Ne pas supposer qu’une opération appelée « metro » concerne Metro Québec.

L’exemple officiel `call hacker-news search query=sqlite` sert de contrôle
général si cette opération est disponible dans le mode choisi. Son succès
ne démontre rien sur les sites d’épicerie.

## 6. Définir le premier jeu d’essai

Choisir une seule enseigne et une seule succursale, puis cinq produits dont
le nom, le format et le prix peuvent être vérifiés sur la page au même moment.
Inclure si possible : prix ordinaire, promotion simple, prix au poids et
offre conditionnelle. Une offre absente reste absente ; ne pas inventer un cas
pour compléter l’échantillon.

Les recherches `lait`, `riz`, `oeufs` sont des exemples de valeurs distinctes,
pas un jeu de résultats garanti. Confirmer qu’elles fonctionnent dans le
navigateur avant l’apprentissage.

Objectif proposé de la première opération :

```text
rechercherProduits(recherche, contexte de magasin)
→ identifiant marchand, nom, format, prix, promotion, conditions, URL
```

Le contexte peut se trouver dans les paramètres, cookies ou en-têtes :
sa forme n’est pas connue à l’avance. Ne déclarer le magasin paramétrable
qu’après une vérification démontrant qu’un changement est respecté.

## 7. Procédure Metro

### 7.1. Établir la référence dans Chrome

1. Ouvrir <https://www.metro.ca/fr>.
2. Choisir explicitement la succursale et noter son identité.
3. Rechercher les trois aliments d’exemple et vérifier les résultats visibles.
4. Copier les URL réellement utilisées et noter les changements de page.
5. Ouvrir les fiches des cinq produits de référence.

Le formulaire observé dans le HTML utilise `/epicerie-en-ligne/recherche`
et le champ `filter`. L’URL ci-dessous est un candidat fondé sur ce formulaire,
mais l’appel direct a reçu 403. Adapter la procédure si le navigateur utilise
une autre URL ou un parcours nécessitant des interactions.

### 7.2. Capturer et inspecter

```bash
npx -y api-anything capture \
  'https://www.metro.ca/epicerie-en-ligne/recherche?filter=lait' \
  --example filter=lait --outline
```

Lire `candidates`, `outline`, les codes HTTP et les éventuels blocages.
Remplacer les marqueurs ci-dessous par les identifiants réellement retournés :

```text
npx -y api-anything inspect CAPTURE_ID REQUEST_ID --outline
```

Retenir une réponse contenant les produits attendus. Les suggestions de saisie
ne constituent pas nécessairement une recherche complète. Si le HTML est rendu
côté serveur, il peut suffire ; sinon retenir la réponse JSON qui alimente
les cartes. Ne pas choisir un endpoint uniquement d’après son nom.

Si les interactions sont indispensables, les options `--steps` et
`--soft-from` existent dans la documentation. Les sélecteurs doivent provenir
de la page inspectée ; aucun sélecteur fonctionnel n’a été établi ici.

### 7.3. Apprendre puis appeler

Après confirmation du parcours et des exemples :

```bash
npx -y api-anything learn \
  'https://www.metro.ca/epicerie-en-ligne/recherche?filter={query}' \
  --site optimeal-metro --op rechercherProduits \
  --args query=lait --args2 query=riz --args3 query=oeufs

npx -y api-anything ops optimeal-metro

npx -y api-anything call optimeal-metro rechercherProduits query=riz
```

`optimeal-metro` et `rechercherProduits` sont des noms proposés pour l’opération
à créer, pas des opérations déjà disponibles. Lire les avertissements et
vérifier les résultats avec une quatrième recherche non utilisée pour apprendre.

La CLI peut choisir une mauvaise réponse ou extraire les mauvais champs.
Dans ce cas, utiliser les captures et les options documentées `--pick-request`,
`--extract`, `--pick`, `--html` ou `--embedded` après inspection du schéma réel.
Ne pas recopier des chemins JSON supposés.

### 7.4. Vérifier le contexte

Comparer les résultats à la page de référence, puis recommencer après
redémarrage. Tester aussi une seconde succursale, si disponible et autorisée.
Un résultat identique ne prouve pas que le magasin est ignoré : les prix
peuvent être identiques. Vérifier le contexte renvoyé ou choisir un cas dont
la différence est observable. Sinon marquer la portée « non vérifiée ».

## 8. Procédure Super C

Appliquer le même protocole, indépendamment de Metro :

1. Ouvrir <https://www.superc.ca/fr> et choisir la succursale.
2. Vérifier les recherches et relever les URL réelles.
3. Capturer la page et identifier la réponse de produits.
4. Apprendre seulement si les deux exemples et le contrôle sont exploitables.

Le formulaire observé utilise `/recherche` et `filter` :

```bash
npx -y api-anything capture \
  'https://www.superc.ca/recherche?filter=lait' \
  --example filter=lait --outline

npx -y api-anything learn \
  'https://www.superc.ca/recherche?filter={query}' \
  --site optimeal-superc --op rechercherProduits \
  --args query=lait --args2 query=riz --args3 query=oeufs

npx -y api-anything ops optimeal-superc
```

Ces commandes restent des essais conditionnels : la recherche HTTP directe
était bloquée pendant l’analyse. Distinguer les promotions accessibles à tous,
les prix Moi, les coupons et les prix ordinaires. La ressemblance de l’interface
avec Metro ne prouve pas l’identité des réponses ou paramètres.

## 9. Procédure Maxi

Ne pas supposer une URL de recherche ou un endpoint : aucun n’a été confirmé
pendant cette analyse. Partir d’une fiche connue du catalogue actuel.

1. Ouvrir <https://www.maxi.ca/fr> dans Chrome.
2. Sélectionner Maxi Côte-des-Neiges, succursale documentée dans
   [`target_store.json`](../config/catalog/target_store.json).
3. Vérifier l’identité affichée ; la configuration actuelle mentionne le code
   marchand `8661`, sans prouver que tous les futurs prix ont cette portée.
4. Rechercher un produit du catalogue et ouvrir sa fiche.
5. Relever l’URL réelle et capturer cette page avec API Anything.
6. Examiner les réponses et vérifier produit, format, prix et magasin.
7. Utiliser deux autres fiches réelles pour apprendre et contrôler une opération
   de détail, si le parcours s’y prête.
8. Comparer avec Apify pour le même produit, magasin et moment de relevé.

Si les relevés ne sont pas simultanés, une différence peut provenir d’une
variation de prix plutôt que d’une erreur d’extraction. Conserver les dates.
Une lecture de fiche réussie ne valide pas la recherche ni la pagination.

Si l’accès demeure bloqué, terminer le rapport avec ce résultat et conserver
Apify. Ne pas multiplier les tentatives inchangées ni remplacer une source
fonctionnelle par une piste non démontrée. Voir aussi [PCX_PILOT.md](PCX_PILOT.md)
pour l’expérience historique de récupération directe Maxi.

## 10. Procédure Glouton après accord de réutilisation

1. Conserver la référence de l’accord et son périmètre dans les notes privées
   du projet ; ne pas publier d’informations confidentielles.
2. Demander d’abord si un export ou un accès aux données est disponible.
3. À défaut, ouvrir une des trois URL dans Chrome et vérifier les données visibles.
4. Capturer le chargement pour déterminer si les articles proviennent de JSON,
   du HTML, de données intégrées ou seulement d’images.
5. Définir une opération de lecture de circulaire et ses champs à partir de
   cette observation. Séparer les prix des évaluations propres à Glouton.
6. Vérifier les trois enseignes, les dates complètes et les conditions des offres.
7. Étudier séparément la découverte des liens de la semaine suivante.

Les identifiants `5268`, `5267`, `5265` désignent les éditions fournies. Ne pas
les incrémenter pour fabriquer des URL futures. La date du slug ne suffit pas
à établir une date de fin. Une circulaire régionale ne prouve pas un prix
applicable à toutes les succursales.

Aucune commande d’extraction systématique Glouton n’est définie dans ce guide,
car l’accord et le format réel des données restent à établir.

## 11. Erreurs, pagination et répétabilité

| Résultat | Réaction attendue |
| --- | --- |
| `ok` avec données | Vérifier produit, format, prix, contexte et complétude |
| `ok` avec liste vide | Confirmer que la page indique réellement zéro résultat |
| `input` | Corriger les paramètres ; ne pas réapprendre sans raison |
| `auth` | Noter le besoin de session ; l’utilisateur effectue la connexion nécessaire |
| `blocked` | Consigner le blocage ; arrêter les tentatives répétitives |
| `rate` | Respecter le délai annoncé et réduire la fréquence |
| `drift` | Examiner la réparation ou réapprendre de façon contrôlée |
| `error` ou délai dépassé | Garder une erreur explicite ; ne pas produire un faux catalogue vide |
| `unproven` | Paramètre potentiellement ignoré ; validation supplémentaire nécessaire |
| `healed` | Consigner le changement et revérifier le résultat métier |

Consigner le `tier`, la durée et la version de l’opération. Un navigateur
nécessaire à chaque appel implique des contraintes supplémentaires pour un
traitement serveur, même si le prototype local fonctionne.

Après validation de la première page seulement : observer « page suivante »
ou « afficher plus », vérifier que les identifiants changent et utiliser le
curseur ou numéro réellement retourné. Dédupliquer par identité marchande,
contrôler l’arrêt et limiter le nombre de pages du test. Ne pas annoncer une
couverture complète à partir d’une seule page de résultats.

## 12. Normalisation vers le modèle OptiMeal

Le résultat brut ne doit pas être transmis directement à la liste d’achats.
La correspondance à un ingrédient `ing_…` doit être explicite et vérifiée.
Une recherche « lait » peut aussi retourner du chocolat au lait.

| Champ actuel | Règle de préparation |
| --- | --- |
| `external_product_id` | Identifiant marchand réel, conservé comme texte, y compris les zéros initiaux |
| `retailer` | `maxi`, `metro` ou `superc` ; Glouton est une provenance, pas une quatrième enseigne |
| `store_id` | Identifiant établi ; inconnu reste `null`, sans prétendre à une portée locale vérifiée |
| `name` | Description exacte permettant de vérifier la variante |
| `quantity`, `unit` | Format vendu ; distinguer paquet, poids, volume et lot |
| `price` | Prix de base lorsqu’il est réellement fourni ; ne pas le reconstruire à partir d’un pourcentage |
| `promo_price` | Prix promotionnel explicite, avec conditions vérifiées |
| `currency` | CAD pour les données admises dans le catalogue actuel |
| `valid_from`, `valid_to` | Dates fournies par la source ; aucune fin inventée |
| `retrieved_at` | Date réelle de récupération, distincte de la période de promotion |
| `source`, `url` | Provenance et lien de référence |
| `image_url`, `image_source` | Facultatifs, avec validation selon le contrat existant |

Utiliser des décimaux exacts pour les calculs Python. Un prix inconnu n’est pas
zéro. Une quantité ou unité illisible reste inconnue et exclut les conversions
non justifiées. Ne pas comparer directement 3,99 $ pour 500 g à 5,49 $ pour 1 kg.

Les limites simples sont désormais représentables : `LimiteQuantite` et
`PrixApresLimite` dans les fichiers marchands, puis `quantity_limit` et
`price_after_limit` dans les contrats, depuis la migration `0016`.
L’huile d’olive Maxi sert d’exemple : 7,77 $ pour les quatre premières unités,
puis 10 $ chacune, avec des dates du 12 au 18 novembre confirmées par
l’utilisateur après la collecte. Voir [CONTRACTS.md](CONTRACTS.md#prix-promotionnel-avec-limite-de-quantité).

Les prix membre, coupons et offres d’achat multiple restent à modéliser selon
leurs règles propres. Les conserver dans la capture et un rapport de
vérification ; ne pas les importer comme promotions ordinaires en perdant
leurs conditions. Cette extension du modèle ne valide pas une intégration
API Anything ni une extraction automatique de toutes ces conditions.

Le modèle courant conserve une offre actualisée, pas une série historique de
prix. Le nouvel outil ne résout pas à lui seul cet historique ni les futurs
instantanés des listes d’achats.

Références locales : [CONTRACTS.md](CONTRACTS.md), [CATALOG.md](CATALOG.md),
[`common_schemas.py`](../app/catalog/common_schemas.py),
[`offer_import.py`](../app/catalog/offer_import.py).

## 13. Intégration proposée, sans réorganisation du backend

Les éléments ci-dessous sont à développer après les essais :

```text
backend/app/price_sources/api_anything.py    # Adaptateur de lecture
backend/cli/collect_api_anything.py         # Collecte bornée et archive
backend/tests/test_api_anything_source.py   # Contrat de l’adaptateur et erreurs
```

Réutiliser les modules de catalogue existants. Éviter un second ensemble de
services, schémas et routes qui reproduirait leur responsabilité.

```text
Site marchand → API Anything → capture brute datée
→ normalisation → vérification → catalogue commun valide
→ import PostgreSQL existant → FastAPI → mobile
```

### Client Python, exemple conditionnel

Le client officiel est installé depuis le dépôt selon sa documentation :

```bash
python -m pip install "git+https://github.com/goodnight000/api-anything#subdirectory=python"
```

Il dépend aussi du serveur Node. Pour des essais reproductibles, fixer ensuite
la révision Python et la version Node réellement validées. Ne pas ajouter
automatiquement cette dépendance aux exigences partagées du projet.

```python
from api_anything import Client

with Client.start() as client:
    result = client.call(
        "optimeal-metro",
        "rechercherProduits",
        {"query": "riz"},
    )
    if not result.ok:
        raise RuntimeError(f"{result.klass}: {result.reason}")
    produits_bruts = result.data
```

Cet exemple requiert l’opération apprise. Il ne produit pas encore un
`CommonCatalog`. `Client.start()` lance un serveur pendant le bloc et peut
résoudre une version via npx ; fixer sa commande/version pour une campagne
reproductible. Un traitement d’import doit partager une instance sur son lot,
plutôt que démarrer un serveur par produit ou par requête mobile.

Sources : [client Python](https://github.com/goodnight000/api-anything/blob/main/docs/PYTHON.md),
[serveur HTTP](https://github.com/goodnight000/api-anything/blob/main/docs/SERVE.md).

### Compatibilité avec les imports existants

Deux voies sont envisageables, à choisir avant de développer :

1. Adapter les résultats aux fichiers sources actuels, puis réutiliser
   `build_common_catalog` et ses correspondances explicites.
2. Produire directement un catalogue commun validé, en conservant les
   ingrédients, catégories, identités et provenances requis.

La première voie exige de respecter les champs exacts et les lignes du fichier
de correspondance. Ajouter arbitrairement des produits ou champs dans les JSON
marchands ne suffit pas. La seconde demande un assemblage et une validation
appropriés ; ce n’est pas une simple liste de réponses API.

Les commandes existantes, depuis la racine et avec l’environnement Python
activé, sont :

```bash
python -m backend.cli.build_common_catalog --output /tmp/optimeal-catalog-candidat.json
python -m backend.cli.export_shared_contracts --check
```

La première reconstruit les sources actuellement référencées : elle ne collecte
pas de nouveaux prix. La seconde vérifie les exports et jeux de référence du
dépôt, pas automatiquement un fichier candidat arbitraire. Valider le candidat
explicitement avec `CommonCatalog` et les contrôles métier du protocole.

L’import suivant écrit dans la base configurée ; le réserver à une base de
test pendant l’évaluation, après vérification des ingrédients et migrations :

```bash
python -m backend.cli.import_offers --input /tmp/optimeal-catalog-candidat.json
```

Ne pas l’exécuter sur Supabase partagé comme simple test de découverte.
L’import actualise les offres et ne conserve pas leur ancien état.

Le mobile continue de lire les routes FastAPI existantes. Aucune collecte
n’est déclenchée par l’ouverture de Promos ou de Liste d’achats. Le serveur
API Anything reste local au traitement d’import, avec son jeton hors du mobile.

## 14. Conservation des preuves et gestion d’un échec

Créer un dossier de campagne hors Git, par exemple :

```text
/tmp/optimeal-api-anything-tests/AAAA-MM-JJ-enseigne/
  environnement.md
  observations.md
  reference-produits.csv
  appel-brut.json
  candidat-normalise.json
  validation.md
```

Ce chemin est temporaire. Pour poursuivre les essais plusieurs jours, copier
les éléments utiles dans un emplacement local durable et privé. Ne pas
versionner les captures de navigateur ou sessions : elles peuvent contenir
des jetons, cookies ou données personnelles. Un exemple destiné à Git doit
être réduit, anonymisé et réutilisable selon les conditions de la source.

Une collecte échouée ne doit pas effacer les dernières données valides ni
réactualiser leur date. Conserver la date du dernier succès, le motif d’échec
et le statut de fraîcheur. Si les prix conservés sont anciens, l’interface
doit pouvoir le signaler ; aucune bascule silencieuse ne transforme une
capture locale en donnée commerciale fraîche.

## 15. Critères de validation proposés

Ces critères constituent un protocole à appliquer, pas des résultats obtenus.

| Domaine | Vérification attendue |
| --- | --- |
| Exactitude | Les cinq produits correspondent à la variante, au format et au prix visibles au moment du contrôle |
| Contexte | Enseigne et succursale établies, ou portée explicitement non vérifiée |
| Promotions | Conditions et dates conservées ; prix ordinaires et membre distincts |
| Quantités | Paquets, unités et poids correctement différenciés |
| Paramètres | Une nouvelle recherche apporte les résultats attendus ; paramètres non prouvés signalés |
| Pagination | Si testée, deuxième page différente, doublons contrôlés et arrêt explicite |
| Erreurs | Blocage, panne, session et liste vide ne sont pas confondus |
| Répétabilité | Nouveau processus et nouvelle session testés ; second relevé daté lorsque possible |
| Rejeu | Même capture normalisée sans réseau, résultat stable et sans doublon à l’import |
| Intégration | Catalogue candidat valide et import testé sur base isolée |

Pour le premier échantillon, exiger une vérification de chaque ligne avant
import. Cinq produits corrects ne constituent pas une garantie statistique
sur le catalogue complet. Mesurer ensuite la couverture sur les 31 ingrédients
du référentiel, sans confondre produit absent et erreur de collecte.

Après création de l’adaptateur, ajouter des tests sur captures maîtrisées :
réponse valide, données manquantes, format inconnu, prix conditionnel, erreur
de session, délai, blocage et dédoublonnage. Les tests courants ne doivent
pas dépendre de sites marchands en direct ; les essais réseau restent séparés.

Décision par source : **retenue pour un prototype**, **à corriger**, **bloquée**
ou **abandonnée pour cette campagne**, avec raison et limites. La décision de
collecte régulière exige une répétabilité et un cadre de réutilisation établis.

## 16. Fiche à remplir pour chaque campagne

```markdown
# Essai API Anything — enseigne — date

- Date, heure et fuseau :
- Objectif et autorisation de réutilisation applicable :
- Système, Node, npm, navigateur et version API Anything :
- Version/révision du client Python, si utilisé :
- Configuration local-only et partage :
- Succursale, identifiant et preuve du contexte :
- Connexion nécessaire : oui / non / non déterminé
- URL réelles et commandes exécutées :
- Opération, paramètres, version/export local :
- Références des captures privées :

| Produit | Format | Prix de référence | Prix extrait | Conditions | Verdict |
| --- | --- | --- | --- | --- | --- |
| À compléter | | | | | |

- Résultat brut : ok, class, reason, next, tier, durée
- Paramètres vérifiés et paramètres non prouvés :
- Pages parcourues, doublons et couverture :
- Résultat après redémarrage/changement de session :
- Vérification de la succursale :
- Champs inconnus et offres exclues :
- Validation du candidat et import isolé, si réalisés :
- Échecs observés et actions réellement tentées :
- Décision, justification et prochain test :
```

Ne jamais remplir les résultats attendus comme s’ils avaient été observés.

## 17. Documents et sources à relire avant les essais

### Projet API Anything

- [Dépôt officiel et licence](https://github.com/goodnight000/api-anything)
- [Installation](https://github.com/goodnight000/api-anything/blob/main/INSTALL.md)
- [Démarrage et prérequis](https://github.com/goodnight000/api-anything/blob/main/docs/QUICKSTART.md)
- [Commandes, résultats et limites](https://github.com/goodnight000/api-anything/blob/main/docs/REFERENCE.md)
- [Méthode de création d’opérations](https://github.com/goodnight000/api-anything/blob/main/skills/api-anything/references/authoring.md)
- [Implémentation et aide de la CLI](https://github.com/goodnight000/api-anything/blob/main/src/cli.ts)
- [Client Python](https://github.com/goodnight000/api-anything/blob/main/docs/PYTHON.md)
- [Serveur HTTP](https://github.com/goodnight000/api-anything/blob/main/docs/SERVE.md)

Ces liens pointent vers `main`, qui peut évoluer. Lors du test, consigner la
version et, si possible, les liens vers la révision effectivement utilisée.

### OptiMeal

- [Guide backend](../README.md)
- [Catalogue](CATALOG.md) et [collecte Apify](APIFY.md)
- [Pilote PC Express](PCX_PILOT.md)
- [Contrats](CONTRACTS.md), [données](DATA.md) et [migrations/imports](MIGRATIONS.md)
- [Fonctionnement général](../../README-fonctionnement.md)

Le texte initial fourni dans la conversation a servi de point de départ.
Ce guide corrige notamment la portée du mode local-only, conserve les limites
observées et adapte l’intégration proposée à l’organisation réelle du backend.

*Dernière mise à jour : 14 novembre 2026*

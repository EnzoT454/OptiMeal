# API OptiMeal — source optionnelle épiceries.ca

Le serveur permet de rechercher des produits et de récupérer leurs prix par
enseigne depuis [épiceries.ca](https://epiceries.ca/). Il conserve le JSON reçu
et retourne aussi des observations dans un format commun à OptiMeal.
Cette intégration fonctionne à la demande, sans clé API.

```text
Postman / futur mobile → FastAPI → cache → API épiceries.ca
                            ↓
                 validation et normalisation
                            ↓
             JSON sourcé + avertissements qualité
```

L’import PDF local, les estimations et les confirmations après achat restent
des sources distinctes à développer. Aucun PDF ni renseignement utilisateur
n’est envoyé au fournisseur. Cette version ne sauvegarde rien en base et ne
lance pas de collecte hebdomadaire automatique. GitHub Pages héberge seulement
le site de suivi, pas ce serveur Python.

## Démarrer

Depuis la racine du dépôt, avec Python 3.11 ou plus récent :

```bash
python3 -m venv .venv  # seulement si l’environnement n’existe pas déjà
source .venv/bin/activate
python -m pip install -r backend/requirements-dev.txt
export EPICERIES_ENABLED=true
export EPICERIES_STALE_DAYS=7
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8001
```

Documentation interactive : <http://127.0.0.1:8001/docs>.
Contrat OpenAPI : <http://127.0.0.1:8001/openapi.json>.
Le site documentaire utilise le port 8000 ; le backend utilise ici 8001.

Sans `EPICERIES_ENABLED=true`, la source retourne `503` ; `/health` reste
disponible. `EPICERIES_STALE_DAYS` est un seuil d’avertissement configurable
(7 jours par défaut), **pas une date d’expiration prouvée**.
Le fichier `.env.example` décrit les variables ; il n’est pas chargé automatiquement.

Dépendances : FastAPI expose HTTP, Pydantic valide les données, HTTPX effectue
les lectures externes, Uvicorn lance le serveur. Pytest sert uniquement aux tests.
Les dépendances du site restent séparées dans le fichier à la racine.

## Routes disponibles

Toutes sont des lectures `GET`, sans authentification dans ce prototype local.

| Route | Résultat |
| --- | --- |
| `/health` | État du serveur, sans appel externe |
| `/sources/epiceries/categories` | `data.categories`, identifiants et noms du fournisseur |
| `/sources/epiceries/search?q=riz&limit=3` | Résumés bruts validés dans `data.results` et pagination |
| `/sources/epiceries/products/{id}` | Observations `offers`, détail fournisseur `raw`, provenance `source` |

Recherche : au moins un filtre parmi `q` (2 à 200 caractères), `category`
(1–71), `store` (`maxi`, `iga`, `superc`, `metro`, `provigo`, `walmart`),
`discounted` (booléen). `limit` : 1–100, défaut 20 ; `offset` : positif ou nul ;
`sort` : `updated_desc`, `price_asc`, `price_desc`.

**Le filtre `store` sélectionne les produits dont cette enseigne est la moins
chère selon le résumé fournisseur. Il ne retourne pas tout son catalogue.**
Obtenir les catégories avec la route dédiée plutôt que supposer leurs IDs.
`count` décrit la page ; pour continuer si `hasMore=true`, augmenter `offset`
de `limit`. Une recherche ne déclenche pas un appel de détail pour chaque résultat.
Le consommateur choisit les produits utiles puis demande leur détail.

Les routes fournisseur d’historique, de code-barres et de code marchand ne sont
pas encore exposées par OptiMeal. La correspondance entre un ingrédient et un
produit reste à valider : rechercher « lait » peut aussi trouver du chocolat.

## Format JSON

Le détail comporte `schema_version: "1.0"`, `offers`, `raw`, `source`.
Chaque élément de `prices[]` du fournisseur devient une observation dans `offers`.
Une liste vide signifie qu’aucun prix détaillé n’a été fourni.

| Champ d’une observation | Signification |
| --- | --- |
| `product_id` | Identifiant préfixé `epiceries:` ; casse conservée |
| `store`, `store_id` | Enseigne ; succursale inconnue (`null`) |
| `name`, `brand` | Désignation du fournisseur |
| `category` | Identifiant et source ; pas encore une catégorie commune entre fournisseurs |
| `format` | Texte original, quantité décimale et unité si interprétables |
| `price` | Montant décimal en chaîne, CAD, nature `commercial`, rabais déclaré |
| `observed_at` | Date du prix de cette enseigne, pas la mise à jour globale |
| `retrieved_at` | Date de récupération effective, conservée lors d’une lecture du cache |
| `valid_from`, `valid_to` | `null` : période non fournie |
| `source` | Identifiant, lien source, lien marchand, mise à jour globale du produit |
| `quality` | `review_required` et codes d’avertissements |

Les montants utilisent `Decimal` pour les contrôles. `format` reconnaît
uniquement les quantités simples en g, kg, lb, ml et l. Un multipaquet, une plage
ou un format inconnu garde son texte et des valeurs normalisées `null`.
L’unité de vente (`price.basis`), les conditions de fidélité, les taxes et la
consigne restent inconnues. Le prix unitaire annoncé est conservé séparément ;
il n’est pas utilisé pour inventer un prix au paquet ou au poids.

Les contrôles signalent : ancienneté, date future, désaccord date/timestamp,
conflit résumé/détail, format non interprétable, unités incompatibles et prix
unitaire incohérent (tolérance d’arrondi de 0,0051 par 100 g ou 100 ml).
Les avertissements communs sont `validity_unknown`, `branch_unknown`,
`not_verified`. Ils empêchent de présenter ces observations comme des offres
validées ; le futur moteur devra décider explicitement de leur admissibilité.
Une donnée ancienne n’est ni effacée ni qualifiée de promotion actuelle.

## Cache et erreurs

Cache en mémoire : 300 secondes, 128 requêtes distinctes maximum. Un verrou
regroupe les requêtes identiques simultanées. Les appels externes sont espacés
d’au moins une seconde, avec un délai HTTP de 10 secondes et sans relance
automatique. Les erreurs ne sont pas mises en cache ; une panne après expiration
ne retourne pas silencieusement un ancien résultat.

Ces limites sont **par processus** : utiliser un seul worker pour ce prototype.
Avant un déploiement public, prévoir contrôle d’accès ou limitation des clients,
limite de file d’attente et coordination du cache/débit si plusieurs instances.

| HTTP | Interprétation |
| --- | --- |
| 200 | Réponse reçue ; ne garantit pas l’exactitude commerciale |
| 422 | Paramètre local invalide ou filtre manquant ; aucun appel externe |
| 404 | Produit absent chez le fournisseur |
| 502 | Fournisseur inaccessible, erreur HTTP ou JSON/contrat invalide |
| 503 | Source désactivée ou quota fournisseur atteint |
| 504 | Délai fournisseur dépassé |

Les erreurs utilisent `detail` (texte pour les erreurs métier, liste pour la
validation FastAPI). Un prix négatif ou une date obligatoire invalide provoque
un rejet `502` ; une incohérence commerciale exploitable apparaît dans `quality`.

## Tests automatisés

```bash
# Sans réseau, fournisseur simulé et exemples enregistrés
python -m pytest backend/tests -q

# Trois lectures publiques réelles, sans serveur à lancer et sans sauvegarde
python -m backend.smoke
```

Le workflow GitHub `Tests du backend` exécute uniquement les tests sans réseau.
Ils couvrent entrées invalides, activation, pagination, cache/expiration,
normalisation, prix anciens, incohérences, JSON invalide, erreurs et timeout.
Les fixtures documentent notamment les carottes Super C dont le résumé et le
détail divergent. Le test réel vérifie catégories → recherche → détail ; il
échoue si le fournisseur ne répond pas ou si le contrat n’est plus compatible.

Pour vérifier la qualité commerciale, comparer manuellement un échantillon
de 30 produits (10 par enseigne ciblée : Metro, Maxi, Super C), avec **même
format, même région et même période**, au site marchand ou à la circulaire.
Noter séparément nom, format, prix, date et conditions ; compter les concordances,
écarts et cas non vérifiables. Un HTTP 200 seul ne valide pas les prix.

## Postman

1. Lancer le serveur avec la source activée.
2. Dans Postman : **Import → Files**, choisir
   [`postman/OptiMeal.postman_collection.json`](postman/OptiMeal.postman_collection.json).
3. `base_url` vaut `http://127.0.0.1:8001` dans les variables de collection.
4. Exécuter les requêtes dans l’ordre avec **Run collection**, une seule itération.
   La recherche renseigne automatiquement `product_id` pour le détail.
5. Consulter les assertions dans **Test Results**. Le test de cache suppose
   que les requêtes 4 et 5 se suivent en moins de cinq minutes.

Pour importer une commande individuellement : **Import → Raw text**, coller
l’une des commandes suivantes (pas de clé ni d’en-tête particulier) :

```bash
curl 'http://127.0.0.1:8001/health'
curl 'http://127.0.0.1:8001/sources/epiceries/categories'
curl 'http://127.0.0.1:8001/sources/epiceries/search?q=lait&category=7&limit=5'
curl 'http://127.0.0.1:8001/sources/epiceries/products/KmGS0CjUfXoy'
# Test négatif : 422 attendu
curl 'http://127.0.0.1:8001/sources/epiceries/search'
```

L’identifiant fourni est un exemple observé, susceptible de disparaître :
utiliser un ID retourné par la recherche si nécessaire. Pour tester `503`,
arrêter le serveur et le relancer avec `EPICERIES_ENABLED=false`, puis demander
les catégories. Les scénarios de panne/JSON invalide sont simulés par Pytest.

## Sources et limites

Données fournies par **épiceries.ca** : [documentation API](https://epiceries.ca/developers),
[conditions](https://epiceries.ca/conditions), [FAQ](https://epiceries.ca/faq).
L’accès public documenté ne dispense pas de respecter leurs conditions et leur
demande d’usage modéré. L’actualisation hebdomadaire annoncée ne prouve pas la
fraîcheur de chaque observation. Les chaînes ne désignent pas des succursales.
L’API reste une option supplémentaire ; les données PDF, déclarées et estimées
ne sont pas fusionnées automatiquement avec ses observations.

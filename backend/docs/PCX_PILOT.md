# Essai direct PC Express — Maxi

Ce pilote expérimental teste cinq produits du reçu du 3 octobre 2026, pour
Maxi Côte-des-Neiges (`8661`). Il ne remplace pas Apify et ne modifie ni les
reçus ni le catalogue utilisé par l’API.

Selon le retour de l’équipe, le professeur a donné un avis favorable à la
poursuite dans le cadre d’un projet universitaire personnel. Cet avis rapporté
ne constitue pas une autorisation de Loblaw ni une validation pour un usage
commercial. Le pipeline ci-dessous est développé pour ce cadre universitaire.

## Pipeline depuis les extractions de reçus

Le pipeline comporte deux étapes. Les reçus sources restent inchangés.

### 1. Préparer le fichier à compléter

Depuis la racine, avec l’environnement Python activé, la commande suivante
fonctionne sur macOS, Linux et Windows (PowerShell). Ajouter les chemins des
autres extractions Maxi à la suite, si nécessaire.

```text
python -m backend.cli.match_maxi_receipts prepare data/receipts/extractions/recu_maxi.json data/receipts/extractions/recu-maxi-h1-vision.json
```

Le fichier `data/catalog/maxi/maxi_receipt_products.json` contient `product_code`,
`name`, `prix_extrait` et `url`, ainsi que le magasin, la date d’achat et la
référence à la ligne source. `prix_extrait` est le total OCR de la ligne, pas
nécessairement le prix d’une unité. Une valeur absente reste `null`.

Un seul article est conservé par code et magasin. Si plusieurs reçus le
contiennent, l’entrée du reçu le plus récent est retenue ; à date égale, la
dernière occurrence traitée est retenue. Les extractions originales conservent
toutes les occurrences. Une nouvelle préparation conserve les URL déjà saisies
et les produits précédemment ajoutés.

Compléter manuellement `url` avec la fiche française du produit sur Maxi.
Les cinq URL déjà fournies sont renseignées ; les autres restent vides.
Les paramètres de recherche et de panier ne sont pas nécessaires.

### 2. Actualiser les correspondances web

Définir `PCX_API_KEY` dans le terminal. Le programme ne charge pas `.env`.

macOS / Linux (bash ou zsh ; remplacer la valeur entre guillemets) :

```bash
export PCX_API_KEY="votre-cle"
```

Windows (PowerShell) :

```powershell
$env:PCX_API_KEY = "votre-cle"
```

Puis, sur les trois systèmes :

```text
python -m backend.cli.match_maxi_receipts update
```

La date demandée est celle du jour à Montréal ; `--date 2026-10-06` permet
de la préciser. Chaque appel utilise le `store_id` de l’entrée et la clé
d’application, sans cookies copiés. Les requêtes sont séquentielles avec une
pause d’une seconde ; chaque requête a un délai maximal de vingt secondes et
n’est pas relancée automatiquement.

Le fichier `data/catalog/maxi/maxi_web_receipt_match.json` contient :

| Champ | Signification |
| --- | --- |
| `product_code` | Code extrait du reçu |
| `maxi_product_id` | Identifiant récupéré dans l’URL |
| `produit`, `marque` | Nom complet et marque retournés |
| `format` | Format retourné par le fournisseur |
| `prix_web` | Prix de l’offre, en chaîne décimale à deux chiffres |
| `type_fournisseur` | Type brut, par exemple REGULAR ou SPECIAL |
| `date_ajout` | Première récupération réussie, inchangée ensuite |
| `last_update` | Dernière récupération réussie, même si le prix reste identique |
| `store_id`, `currency`, `gtin`, `url` | Contexte du magasin demandé et identité |
| `offres`, `pricing_units` | Conditions du prix, taxes, frais et modalités de vente |
| `requested_date` | Date demandée au fournisseur |

Les horodatages sont en UTC avec fuseau explicite. Le fichier représente le
dernier état connu, pas l’historique des prix. Les champs fournisseur décimaux
sont conservés sans calcul en virgule flottante.

Avant actualisation, le programme vérifie l’identifiant Maxi, le GTIN et sa
correspondance au code reçu. Il accepte le corps UPC à onze chiffres ou un
GTIN complet valide. Les codes internes/PLU et les produits sans GTIN ne sont
pas rapprochés automatiquement. Une réponse sans prix, avec plusieurs offres
ou avec une correspondance incorrecte est signalée pour révision.

Une URL vide ne déclenche aucun appel. En cas d’erreur, les anciennes données
et leurs dates sont conservées. Chaque écriture est effectuée via un fichier
temporaire pour éviter un JSON partiellement écrit ; ne pas lancer deux
actualisations concurrentes sur la même sortie. Le rapport séparé
`maxi_web_receipt_match.report.json` décrit les succès, URL manquantes et erreurs,
sans conserver la clé. Le code de sortie vaut 1 si le traitement est partiel,
et 2 en cas d’erreur de configuration ou de fichier.

La première exécution du pipeline a regroupé vingt produits issus de deux
reçus : cinq correspondances web ont été actualisées et quinze URL restent à
compléter. Ces fichiers sont des données locales de travail ; les prix OCR
ne sont pas des contributions confirmées et les données ne sont pas intégrées
automatiquement au catalogue de l’API.

Tests hors réseau :

```text
python -m pytest backend/tests/test_maxi_web_matching.py -q
```

## Premier essai du 6 octobre 2026

| Code du reçu | Article | Résultat |
| --- | --- | --- |
| `05700003460` | CLASS SCE ROSEE | Recherche web HTTP 403 ; identifiant Maxi à fournir |
| `06038318557` | PC PAPRIKA | Endpoint produit HTTP 200 : paprika PC, 48 g, 6,00 $ |
| `06620001994` | CLBH CRCMA MOULU | Recherche web HTTP 403 ; identifiant Maxi à fournir |
| `06780000049` | UNICO THON DOLIV | Recherche web HTTP 403 ; identifiant Maxi à fournir |
| `08870201640` | BM CONFITURE | Recherche web HTTP 403 ; identifiant Maxi à fournir |

Les résultats et la réponse produit sont dans
`data/catalog/maxi/pcx-pilot-2026-10-06/`. Une requête sans clé a retourné
401 ; avec la clé d’application fournie, le paprika a été récupéré par curl
puis par httpx, sans navigateur, authentification de compte ou cookies copiés.
Cette réussite ne valide pas la fiabilité à long terme du service.

Le produit `21117318_EA` expose le GTIN valide `00060383185572` : le code
de reçu correspond ici au corps UPC à 11 chiffres, sans chiffre de contrôle.
Cette relation est contrôlée, mais ne confirme pas automatiquement tous les
rapprochements ni la quantité achetée. Le prix web interrogé pour le 6 octobre
reste distinct du total payé sur le reçu du 3 octobre. Le magasin est conservé
comme contexte demandé ; la réponse ne contient pas de confirmation indépendante
de l’identifiant de succursale.

## Essai des cinq fiches fournies — 6 octobre 2026

Après ajout des quatre URL fournies, les cinq requêtes directes ont retourné
HTTP 200 avec httpx, sans navigateur ni cookies copiés. Les réponses et le
rapport sont dans `data/catalog/maxi/pcx-pilot-2026-10-06-complete/` ; le premier
essai partiel est conservé.

| Code du reçu | Identifiant Maxi | Produit | Format | Prix web | Type fournisseur |
| --- | --- | --- | --- | --- | --- |
| `05700003460` | `20707974_EA` | Classico, sauce pour pâtes rosée | 410 ml | 2,97 $ | SPECIAL |
| `06038318557` | `21117318_EA` | PC, paprika | 48 g | 6,00 $ | REGULAR |
| `06620001994` | `21038672_EA` | Club House, curcuma moulu | 102 g | 6,49 $ | REGULAR |
| `06780000049` | `20415991_EA` | Unico, thon à l’huile d’olive | 3 × 80 g | 5,99 $ | REGULAR |
| `08870201640` | `20307313006_EA` | Bonne Maman, confiture de framboise | 250 ml | 6,29 $ | SPECIAL |

Les cinq GTIN ont un chiffre de contrôle valide et leur corps UPC correspond
au code du reçu. Les cinq prix web sont numériquement égaux aux totaux des
lignes du reçu ; cette égalité ne prouve pas la quantité achetée ni la validité
historique du prix web. Les deux offres SPECIAL exposent une échéance brute
`2026-10-07T00:00`, sans fuseau explicite : conserver cette valeur sans en
déduire une règle de fin de journée. Tous les états de stock retournés valent
`OK` au moment de la collecte.

Le pilote valide la récupération de fiches connues et leur enrichissement.
La recherche automatique par code et la fiabilité dans la durée restent à
évaluer. Aucun accès navigateur, Scrapy ou modèle IA n’a été nécessaire pour
ces cinq appels produit.

## Reproduire et compléter l’essai

Depuis la racine, utiliser l’environnement Python du projet. Définir `PCX_API_KEY`
avec la valeur de `x-apikey` observée dans le navigateur. Ne pas la versionner.
Avec zsh, une saisie masquée est possible :

```bash
read -rs 'PCX_API_KEY?Clé PC Express : '
export PCX_API_KEY
python -m backend.cli.probe_pcx_products \
  --date 2026-10-06 \
  --output-dir data/catalog/maxi/pcx-pilot-nouvel-essai
unset PCX_API_KEY
```

Choisir un nouveau dossier pour chaque exécution. Le programme refuse d’écraser
une collecte existante. Le code de sortie vaut 1 si au moins un article reste
non récupéré ; le rapport des résultats partiels est néanmoins conservé.

Les cinq correspondances sont maintenant renseignées dans
`backend/config/catalog/pcx_receipt_pilot.json`. Pour un autre produit,
ouvrir la recherche par code dans le navigateur, vérifier la fiche et reporter
l’identifiant après `/p/` dans ce fichier. Relancer ensuite la commande avec
un nouveau dossier de sortie. Le pilote est limité à dix produits.

La commande conserve toutes les offres, dont prix membres, promotions,
taxes et frais, sans choisir arbitrairement une offre ni convertir les prix
en modèle métier définitif. Les champs fournisseur restent dans leur format
source ; `9999-12-31` ne constitue pas une garantie de validité du prix.
Les erreurs HTTP et réseau sont signalées sans enregistrer les clés ou cookies.
La découverte automatique des identifiants n’est pas implémentée : les recherches
web servent uniquement à mesurer leur accessibilité.

Vérification locale, sans réseau :

```bash
python -m pytest backend/tests/test_pcx_probe.py -q
```

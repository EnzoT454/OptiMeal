<h1 align="center">OptiMeal</h1>

<p align="center">
  Planifier ses repas et préparer sa liste d’épicerie selon son budget.
</p>

Nous développons OptiMeal dans le cadre du cours IFT3150 à l’Université de Montréal. L’idée est de réunir les recettes, les repas de la semaine et les prix des épiceries au même endroit pour faciliter la préparation des courses.

L’application permettra de choisir ses recettes et ses portions, puis de préparer une liste d’achats par magasin en tenant compte du budget et des déplacements. Trois modes d’ajout sont prévus : ajouter une recette manuellement, trouver une idée et cuisiner avec ce qu’on a déjà. L’ajout manuel donnera le choix entre remplir un formulaire et saisir un texte que l’IA transformera dans le même format de recette, à vérifier avant de l’enregistrer.

Lorsque les prix précis manquent, nous afficherons une fourchette estimée min–max, en signalant les articles dont le prix reste impossible à estimer. À la fin des courses, l’utilisateur pourra aussi photographier son reçu et confirmer les prix extraits pour contribuer aux estimations. Cette contribution sera facultative.

## Technologies

- **Mobile prévu :** React Native · TypeScript · Expo, pour iOS et Android
- **Backend :** Python · FastAPI
- **Base de données prévue :** PostgreSQL
- **Documentation :** Zensical · GitHub Pages

## Statut actuel

Nous avons mis en place le site de suivi et une première API qui utilise épiceries.ca pour rechercher des produits et récupérer leurs prix. Les données retournées conservent leur source et leur date, avec des avertissements lorsque les prix semblent anciens ou incohérents. Leur concordance avec les prix en magasin reste à vérifier.

L’application mobile, les comptes et la sauvegarde en base de données restent à développer. La prochaine étape est de vérifier un échantillon de prix et de relier le mobile au serveur.

## Installation

Pour lancer le backend et la documentation en local : **Python 3.11+** et **Git**.

```bash
git clone https://github.com/EnzoT454/OptiMeal.git
cd OptiMeal
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt -r backend/requirements-dev.txt
```

## Lancer le backend

Depuis la racine du projet, avec l’environnement virtuel activé :

```bash
export EPICERIES_ENABLED=true
python -m uvicorn backend.app.main:app --reload --port 8001
```

L’API est accessible sur `http://localhost:8001`, avec sa documentation interactive sur `http://localhost:8001/docs`.

Le [guide du backend](backend/README.md) détaille les routes disponibles et les limites des données. Une [collection Postman](backend/postman/OptiMeal.postman_collection.json) permet aussi d’essayer les requêtes.

## Tests

Les tests du backend utilisent des réponses enregistrées et ne font pas d’appels réseau :

```bash
python -m pytest backend/tests -q
```

Pour essayer le connecteur avec trois lectures réelles sur épiceries.ca :

```bash
python -m backend.smoke
```

## Structure du projet

```text
OptiMeal/
├── backend/
│   ├── app/
│   │   ├── main.py       # Application FastAPI
│   │   ├── api/          # Routes HTTP
│   │   ├── schemas/      # Validation des données
│   │   └── services/     # Connecteur épiceries.ca et traitement des prix
│   ├── postman/          # Collection de requêtes
│   └── tests/            # Tests et exemples de données
├── docs/                 # Présentation, suivi, synthèse et références
├── .github/workflows/    # Tests du backend et publication du site
└── zensical.toml         # Configuration du site de suivi
```

## Documentation

Le [site de suivi du projet](https://enzot454.github.io/OptiMeal/) regroupe nos objectifs, notre avancement et les références utilisées. Il reprend le [template du cours IFT3150](https://github.com/udem-diro/template-projet).

Pour le consulter en local, lancer cette commande dans un autre terminal avec l’environnement virtuel activé :

```bash
zensical serve
```

Le site est accessible sur `http://localhost:8000`. Pour vérifier sa construction : `zensical build --clean`. La publication sur GitHub Pages se fait automatiquement lors des mises à jour de `main`.

## Équipe

- Hamza Aqel
- Nouh Harfouche

**Superviseur :** Louis Edouard Lafontant<br>
**Session :** Automne 2026<br>
**Cours :** IFT3150 — Projet informatique, Université de Montréal

*Dernière mise à jour : 17 septembre 2026*

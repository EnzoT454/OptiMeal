# OptiMeal — Projet IFT3150

OptiMeal est un projet d’application mobile pour gérer des recettes, planifier les repas et préparer une liste d’épicerie par magasin selon un budget. Le dépôt contient le site de suivi et un premier serveur FastAPI avec une source de prix optionnelle épiceries.ca. L’application mobile reste à développer.

Projet réalisé par **Hamza Aqel et Nouh Harfouche**, à l’Université de Montréal, à l’automne 2026.

## Site de suivi

**Site publié :** [enzot454.github.io/OptiMeal](https://enzot454.github.io/OptiMeal/).

C’est le lien du site publié qu’il faudra déposer sur StudiUM. Vérifier qu’il fonctionne sans connexion à GitHub avant de le remettre.

Le site reprend le [template IFT3150](https://github.com/udem-diro/template-projet) et utilise **Zensical** pour transformer les fichiers Markdown en pages web.

| Fichier | Contenu |
| --- | --- |
| `docs/index.md` | Contexte, problématique, proposition, méthodologie et évaluation |
| `docs/suivi.md` | Avancées, difficultés, choix et prochaines étapes |
| `docs/synthese.md` | Réalisations, résultats et bilan, à compléter progressivement |
| `docs/references.md` | Sources utilisées et aide de l’IA |
| `zensical.toml` | Nom du site, adresse et navigation |
| `.github/workflows/docs.yml` | Vérification et publication automatiques |

À ce stade, la remise porte sur la vue d’ensemble. Les autres pages restent courtes et seront complétées au fil du projet.

## Consulter le site en local

Prérequis : **Python 3.11 ou plus récent** et Git. Depuis un terminal macOS ou Linux :

```bash
git clone git@github.com:EnzoT454/OptiMeal.git
cd OptiMeal
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
zensical serve
```

Ouvrir ensuite `http://localhost:8000`. Les modifications des pages sont prises en compte automatiquement. Si le dépôt est déjà cloné, commencer à la création ou à l’activation de `.venv`.

Pour vérifier la construction complète :

```bash
zensical build --clean
```

Le dossier `site/` contient le résultat généré. Il est ignoré par Git et ne doit pas être modifié à la main.

## Activer la publication sur GitHub

Ces étapes nécessitent les droits de gestion du dépôt :

1. Dans [Settings → Pages](https://github.com/EnzoT454/OptiMeal/settings/pages), sélectionner **GitHub Actions** comme source dans **Build and deployment**.
2. Envoyer les changements de `partieHamza` sur GitHub, puis ouvrir une pull request vers `main`. Le workflow **Site de suivi** vérifie la construction.
3. Fusionner la pull request dans `main`. Le workflow construit puis publie le site automatiquement.
4. Consulter l’onglet **Actions** et attendre la réussite du travail **Publier sur GitHub Pages**. Le déploiement indique l’adresse du site.

Si les fichiers sont déjà dans `main` au moment de l’activation, lancer **Actions → Site de suivi → Run workflow**, en choisissant `main`.

Le workflow vérifie les envois sur `partieHamza` et les pull requests vers `main`. **Seule la branche `main` publie le site.** Les modifications d’une branche de travail deviennent publiques après leur intégration dans `main` et la réussite du déploiement.

La branche [`gh-pages` du template](https://github.com/udem-diro/template-projet/tree/gh-pages) contient ses pages déjà générées. Ici, conformément à la [méthode de publication Zensical](https://zensical.org/docs/publish-your-site/), GitHub Actions transmet directement le dossier `site/` à Pages : il n’est pas nécessaire de copier ou de créer cette branche.

Si la publication échoue, vérifier la source **GitHub Actions** dans Pages, l’activation des Actions et l’autorisation de déployer depuis `main` dans l’environnement `github-pages`. La disponibilité de Pages dépend aussi de la visibilité du dépôt et du forfait GitHub : consulter la [documentation GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) si l’option est absente.

## Maintenir le suivi du cours

Après les rencontres de supervision, habituellement hebdomadaires, noter brièvement le travail réalisé, les difficultés, les décisions et les prochaines étapes. Le suivi doit rendre visibles la démarche, les essais et les apprentissages, en plus des résultats.

Les jalons du cours sont les études préliminaires en semaines 1–2, la réalisation progressive en semaines 3–14, les mises en commun en semaines 5–6, 9–10 et 13–14, puis la présentation finale et le rapport en semaine 15. Le site sera enrichi progressivement pour accompagner ces étapes.

## Backend et données

Le connecteur **épiceries.ca** permet de consulter les catégories, rechercher
des produits et obtenir des observations de prix normalisées, avec provenance,
dates et avertissements. Il complète les autres sources prévues.

Consulter le [guide du backend](backend/README.md) pour le lancement, les routes,
le format JSON et les limites, ainsi que la
[collection Postman](backend/postman/OptiMeal.postman_collection.json) pour les essais.
Le backend se lance séparément du site GitHub Pages.

```bash
source .venv/bin/activate
python -m pip install -r backend/requirements-dev.txt
export EPICERIES_ENABLED=true
python -m uvicorn backend.app.main:app --reload --port 8001
```

Tests sans réseau : `python -m pytest backend/tests -q`.
Test explicite de trois lectures réelles : `python -m backend.smoke`.

## Licence

Le template annonce une licence MIT. Aucun fichier `LICENSE` n’est actuellement présent dans ce dépôt ; les informations de licence restent à compléter.

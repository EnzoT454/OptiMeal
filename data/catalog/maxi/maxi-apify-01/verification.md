# Vérification de la première collecte Apify

Analyse locale de raw.json, catalog.json et rejeu du normaliseur. Aucun nouveau run ni appel payant.

## Succursale déclarée par la source

Les 100 lignes désignent `8661`, « Maxi Montréal Côte-des-Neiges », H3S 2B6, coordonnées 45.50533 / -73.637574. La sélection par H3S1H5 a donc retourné la succursale attendue selon les métadonnées Apify. Cela ne constitue pas une comparaison indépendante des prix au site Maxi ou en caisse. Aucun prix n'est automatiquement approuvé.

## Collecte limitée à une recherche

Le run est SUCCEEDED et capture_complete vaut true : le téléchargement s'est terminé. Les 100 lignes portent cependant `category: search:garlic`. Aucune ligne des neuf autres recherches n'est présente. La limite globale de 100 a été atteinte ; elle est signalée dans collection.truncations. Ces données ne permettent pas d'établir si les autres recherches ont été exécutées à distance ; elles sont absentes de la capture locale.

## Correspondances incorrectes

Le rapprochement actuel propose 58 produits pour ail frais, dont du pain à l'ail, de la mayonnaise, du fromage et des presse-ails. Le mot garlic seul n'est pas une preuve que le produit est de l'ail frais. Plusieurs vraies références d'ail sont présentes, mais la couverture brute surestime la qualité.

Les deux candidats huile d'olive sont « Organic Couscous, Roasted Garlic & Olive Oil » et « Roasted Garlic Olive Oil ». Le premier est du couscous ; le second est une huile aromatisée, hors du périmètre prévu. Le résultat 2/10 ne constitue donc pas une couverture utile de deux ingrédients validés.

## Intégrité

Le contrat Pydantic est valide, le rejeu reproduit le catalogue existant, les 100 identifiants produits sont distincts et les offres référencent des produits présents. Aucune erreur technique de normalisation n'est signalée. Cette validation structurelle ne prouve pas la justesse commerciale.

## Ajustements recommandés

1. Répartir la collecte par ingrédient avec des limites par recherche et un budget total explicite, pour éviter qu'une recherche consomme tout le quota. Vérifier les possibilités du fournisseur avant de multiplier les runs facturables.
2. Renforcer les règles de correspondance : exclure accessoires et préparations ; distinguer produit principal et ingrédient cité dans son nom.
3. Afficher la répartition par requête dans le rapport, séparément des correspondances proposées.
4. Utiliser 8661 pour cibler les prochains essais en conservant sa provenance Apify ; comparer quelques produits et formats au même magasin avant d'approuver les prix.

L'archive et les résultats originaux sont préservés. Aucun paramètre ni règle de correspondance n'a été modifié pendant cet audit.

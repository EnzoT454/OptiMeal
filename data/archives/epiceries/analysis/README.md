# Épiceries.ca — faisabilité d’intégration à OptiBuy

## Conclusion

L’API est accessible et peut accélérer la constitution du catalogue et l’accès aux historiques. Les tests ne justifient pas encore son utilisation comme source unique de prix actuels ou de promotions datées. Intégrer un adaptateur avec validation, provenance et règles de fraîcheur, tout en conservant les circulaires et les observations après achat comme sources distinctes.

Il s’agit d’une proposition d’intégration et de scripts d’exploration, pas d’une intégration FastAPI/PostgreSQL déjà livrée. Les données restent dans `data/`, actuellement ignoré par Git.

## Documentation et accès

La [documentation développeur](https://epiceries.ca/developers) décrit une API GET publique sans clé, avec recherche, fiches produits, historique, codes-barres, codes marchands et catégories. Les réponses emploient une enveloppe `ok/data` ou `ok/error`. La recherche est paginée. Le filtre `store` porte sur l’enseigne la moins chère, pas sur l’ensemble de son assortiment : ne pas l’utiliser pour prétendre télécharger tous les produits vendus chez Metro.

Les [conditions](https://epiceries.ca/conditions) précisent que les prix sont indicatifs, que les différences régionales et erreurs sont possibles et que la disponibilité n’est pas garantie. Prévoir l’attribution à épiceries.ca, un cache et des appels espacés ; le service demande de le contacter avant un usage intensif. Aucun message ne lui a été envoyé.

## Tests réels du 14 septembre 2026

Deux séries limitées ont conservé **21 réponses**, avec une seconde entre les requêtes : **19 HTTP 200** et **2 HTTP 400 attendus** pour des paramètres obligatoires absents. Une requête initiale de découverte, hors de ces fichiers, a aussi réussi. Aucun export massif, PDF ni donnée utilisateur n’a été envoyé.

Vérifications réalisées : enveloppes, recherche, pagination sur deux pages, catégories, fiches par enseigne, historique, résolution d’un code Maxi, concordance timestamp/date sur les prix détaillés et anomalies arithmétiques sur des formats simples. Les réponses et leurs horodatages sont disponibles dans `responses/`.

Constats sur cet échantillon, non représentatif de tout le catalogue :

| Observation | Conséquence |
| --- | --- |
| 71 catégories retournées ; la catégorie 7 est « Lait », la 12 « Yogourt » | Charger les catégories réelles ; les identifiants illustratifs de la documentation ne sont pas une table de référence |
| La recherche libre « lait » retourne aussi du déodorant et des lingettes | Recherche textuelle ≠ correspondance avec l’ingrédient d’une recette |
| La recherche filtrée sur « Lait », chez Metro, retourne une tablette Ritter Sport de 100 g | Le filtre catégorie ne suffit pas ; vérifier nom, format et attributs |
| Beurre 125 g à 4,49 : `unitPrice.value=2.39`, `raw=3.59/100g` | Incohérence interne ; 4,49 / 125 × 100 = 3,592, soit environ 3,59 |
| Un produit de 453 g a un prix unitaire exprimé en 100 ml | Incompatibilité masse/volume à signaler |
| Carottes Super C `yOeGqbs4BAc2` : résumé 1,98, mis à jour le 29 août ; `prices[]` 3,99, relevé le 8 août | Données de moments différents ; ne pas choisir silencieusement un montant |
| Plusieurs relevés détaillés datent du 29 août, un autre du 5 février | Comparer chaque date de prix, pas seulement la date de mise à jour globale |
| Historique du beurre : lignes identiques répétées | Dédupliquer les observations exactes avant les statistiques |
| Résolution Maxi `20021564_EA` : Québon 2 %, 4 L, 8,16 chez Maxi et Provigo | Cas exploitable pour tester le mapping de format et les deux enseignes ; prix non confirmé en magasin |

Les liens marchands ont aussi été essayés : Maxi n’a pas exposé de contenu de prix exploitable dans la lecture web, et Super C a répondu 403. **Aucun prix actuel en magasin n’a donc été confirmé indépendamment.** Les circulaires du 10–16 septembre ne permettent pas de valider directement un relevé d’août, notamment si les formats diffèrent.

## Architecture proposée

```text
API épiceries.ca → adaptateur → réponses brutes → validation/normalisation ┐
Circulaires PDF → extraction locale → vérification des offres            ├→ modèle OptiBuy → PostgreSQL → FastAPI → mobile
Prix déclarés après achat → validation des observations privées          ┘
                                  ↓
                  estimation séparée, calculée et traçable
```

L’API rejoint la famille des sources commerciales, comme les circulaires ; elle ne remplace pas les estimations ou les déclarations d’achat. Le mobile passe par notre serveur pour centraliser cache, contrôle et cohérence. Aucune dépendance aux noms de champs du fournisseur ne doit traverser jusque dans les écrans.

### Modèle de données

- **Product** : identité interne, nom, marque, attributs utiles et catégorie OptiBuy.
- **ExternalProduct** : fournisseur + identifiant externe, liens marchands et correspondance avec le produit interne ; les codes restent des chaînes pour préserver les zéros initiaux.
- **ProductFormat** : format brut et quantité/unité normalisées, précision du rapprochement. Deux formats du même nom ne deviennent pas le même article achetable.
- **PriceRecord** : enseigne, succursale si connue, montant, unité de vente, origine, conditions, date du relevé, date de récupération, validité si disponible, état de validation.
- **PriceEstimate / PriceObservation** : estimation calculée et déclaration utilisateur distinctes ; ne pas remplacer un prix commercial par une déclaration unique.

Le JSON `normalized.example.json` illustre un enregistrement provenant réellement de la réponse Québon. Les dates de validité et la succursale restent `null`. La catégorie OptiBuy est une proposition de mapping. Les montants utilisent des chaînes décimales ; le backend doit calculer avec Decimal.

Conserver séparément les données du résumé et de `prices[]` avant résolution. Le champ global `updated` ne doit pas être affecté à tous les relevés des magasins. `discounted=true` ne fournit ni dates de promotion, ni preuve d’absence de condition d’adhésion. Ne pas fabriquer une semaine jeudi–mercredi à partir d’une date d’observation.

### Synchronisation

1. Charger les catégories, sélectionner les familles utiles, puis paginer la recherche avec une limite raisonnable. Commencer sur un échantillon ou les produits réellement utilisés, pas par l’aspiration du catalogue entier.
2. Récupérer les détails des produits retenus. Utiliser UPC ou code marchand quand disponible, puis vérifier format et attributs ; ne pas se fier au premier résultat d’une recherche.
3. Sauvegarder les réponses brutes avec URL, heure, empreinte et version d’adaptateur. Normaliser les relevés par enseigne. Placer les contradictions et données incomplètes en attente de revue.
4. Garder un cache HTTP au moins égal à la durée annoncée par le fournisseur ; les réponses examinées déclarent `max-age=300`. Une première règle proposée est au plus une requête/seconde, sans rafales, avec délai maximal et reprises limitées en cas de panne.
5. Synchroniser les produits suivis après le dépôt hebdomadaire des circulaires, vérifier si leurs relevés ont effectivement changé, puis réessayer plus tard si nécessaire. Le mercredi ne prouve pas la présence des prix du jeudi. Respecter les délais et un éventuel `Retry-After`.
6. Faire des écritures idempotentes à partir du fournisseur, produit, enseigne, format, date et contenu du relevé. Conserver les versions corrigées au lieu d’écraser l’historique. Deux réponses identiques ne deviennent pas deux observations statistiques.

Politique initiale à discuter : signaler un relevé de plus de 7 jours comme ancien et l’exclure d’un panier présenté comme courant. Ce seuil est un choix produit, pas une garantie de validité. Une donnée historique peut contribuer à une estimation explicitement calculée, jamais devenir automatiquement une promotion actuelle. Les listes sauvegardées gardent leurs instantanés.

## Comment déterminer si l’intégration est correcte

### 1. Contrat et robustesse

Automatiser les tests de schéma, champs absents/null, montants non finis, enseignes inconnues, pagination, 400/404, 429, délais, 5xx et JSON invalide. Préserver les anciennes données en cas d’échec partiel sans masquer leur âge. Un champ supplémentaire ne doit pas casser l’import ; un champ obligatoire absent doit le faire passer en revue.

### 2. Cohérence interne et transformation

Les réponses sauvegardées deviennent des fixtures : tester le conflit de prix des carottes, le déodorant exclu des ingrédients, la tablette mal classée, les doublons d’historique et la conservation des dates par enseigne. Tester aussi `2 L`, `500 g`, `3 lb`, multipaquets, formats inconnus et produits au poids ; la normalisation ne doit pas inférer un poids vendu à partir d’un prix au kg.

Recalculer le prix par unité quand la base de vente et le format sont établis. Tolérer les arrondis documentés, mais pas les incohérences de dimension ou les écarts importants. Par exemple 8,16 pour 4 L donne 2,04/L et 0,204/100 ml ; l’affichage 0,20/100 ml est compatible avec un arrondi. `unitPrice.value` et son texte brut doivent être contrôlés séparément.

### 3. Validation indépendante des prix

Construire un jeu de **30 produits proposés, 10 par enseigne cible**, couvrant produits au poids, paquets, multipaquets et promotions conditionnelles. Pour chaque cas, relever le même produit/format, dans la même succursale ou le même contexte en ligne, à la même période. Conserver la référence marchande ou le reçu, la date et les conditions.

Mesurer séparément : produits retrouvés, correspondances exactes, prix concordants, prix récents, formats exploitables et conditions complètes. Un format différent se classe non comparable, pas comme erreur de prix ni comme réussite. Les cas sans prix marchand accessible restent non vérifiés. Répéter après un changement de semaine avant de conclure à la fiabilité opérationnelle.

### 4. Validation du panier

Sur de petites listes connues, calculer manuellement les paquets et le total. Vérifier qu’un produit ancien, ambigu, inconnu ou d’un magasin non disponible n’est pas sélectionné comme une offre actuelle certaine. Tester la stabilité des anciennes listes après synchronisation.

Critère pour un pilote : tous les tests de transformation et d’erreurs passent ; les anomalies connues sont détectées ; les articles utilisés dans le panier de référence sont vérifiés ou explicitement estimés/inconnus. Fixer ensuite, avec l’équipe, un seuil de couverture et un budget de correction à partir des résultats mesurés. Les 21 requêtes actuelles ne suffisent pas à déterminer ces seuils.

## Rejouer les vérifications

Depuis la racine :

```bash
# Réseau : au plus 12 requêtes pour la première série, 10 pour la seconde.
python data/epiceries_analysis/probe.py
python data/epiceries_analysis/probe.py --targeted

# Hors ligne, sur les réponses enregistrées.
python data/epiceries_analysis/audit.py
```

Les scripts utilisent uniquement la bibliothèque standard Python. Une relance du probe remplace les fixtures de cette étude ; les archiver avant une nouvelle campagne. L’audit vérifie un sous-ensemble de formats et de règles : il n’est pas un adaptateur de production. Le rapport contient 28 signalements sur les réponses sauvegardées, avec répétitions d’un même produit entre endpoints ; **ce nombre n’est pas un taux d’erreur du catalogue**.

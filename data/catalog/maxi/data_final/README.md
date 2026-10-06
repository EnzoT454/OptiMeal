# Données Maxi au format commun

`produits.json` contient les 31 références sélectionnées. `promos.json` contient les 196 offres promotionnelles. Les deux fichiers utilisent exactement les mêmes attributs que `data/catalog/superc/produits.json` :

- Chaque entrée : `Id`, `NomProduit`, `Categorie`, `alias`, `Produits`.
- Chaque produit : `Id`, `Description`, `Id_magasin`, `Prix`, `Unité`, `Quantité`, `DateDebut`, `DateFin`, `IsPromotion`, `Source`, `Url`.

Les identifiants d’entrée sont des numéros locaux au fichier, pas des identifiants communs entre enseignes. L’identifiant du produit reste celui d’Apify, suffixe compris ; le magasin est `8661` et la source est `apify`. Les prix sont en dollars canadiens. Les unités et quantités proviennent des formats normalisés : `unit` devient `un`, tandis que `g` et `ml` restent inchangés. Un poids variable ou une quantité inconnue reste `null` ; aucune quantité de 1 kg n’est supposée.

`DateDebut` et `DateFin` reprennent seulement les dates de validité fournies. Les dates de collecte ne sont pas des dates de promotion et ne les remplacent pas.

Pour les 31 références, les catégories et alias viennent de la configuration des ingrédients. Pour les promotions, chaque offre garde sa propre entrée, sa catégorie correspond au rayon de collecte et ses alias restent vides : aucune correspondance avec un ingrédient n’est inventée.

Hamza a revu et vérifié les produits, les prix et la succursale le 4 octobre 2026. Le format commun ne possède pas d’attribut de validation : cette confirmation et tous les détails techniques restent conservés dans `../archives/data_final-before-common-format/produits.json` et `promos.json`. Ces archives gardent aussi les anciens prix, conditions de promotion, avertissements, formats bruts et sources détaillées qui n’ont pas de champ équivalent dans le format simplifié.

Les nouvelles collectes nécessitent leur propre vérification. Ces fichiers ne sont pas directement chargeables par l’API actuelle, qui attend encore `catalog-pilot-1.0`.

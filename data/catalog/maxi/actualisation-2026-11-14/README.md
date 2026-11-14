# Actualisation des 31 références Maxi — 14 novembre 2026

Source : Apify, Maxi Montréal Côte-des-Neiges, succursale 8661.

## Correction des dates et du prix conditionnel

Les dates du **12 au 18 novembre 2026 inclusivement** ont été confirmées
par l’utilisateur après le premier import. Elles s’appliquent aux quatre
promotions déclarées : carottes, pommes de terre, huile d’olive et thon.
Cette confirmation est distincte des réponses Apify, qui ne contiennent
pas de dates de validité.

Le modèle est étendu par `0016_offer_quantity_limits`. L’huile d’olive est
maintenant enregistrable à **7,77 $ par unité jusqu’à 4 unités, puis 10 $ par
unité supplémentaire**. Son prix régulier reste inconnu ; le prix après
limite ne le remplace pas. Quatre unités coûtent 31,08 $, cinq coûtent 41,08 $.
Les champs JSON sont `LimiteQuantite: 4` et `PrixApresLimite: 10.0`.
Les conditions sont affichées dans le mobile. Les limites de poids variable
des trois autres références restent inchangées.

La suite de ce rapport conserve l’état du **premier import**, lorsque les
dates n’étaient pas encore confirmées et que le modèle ne représentait pas
la limite. `selection.json`, `import-result.json` et `api-verification.json`
sont les preuves de cet état initial. Le correctif et sa vérification Supabase
sont consignés séparément dans `correction-conditions.json` et
`api-verification-corrected.json` après application.

La migration `0016` et les quatre corrections ont été appliquées sur Supabase.
La lecture réelle de l’API confirme quatre promotions actives les 12 et
18 novembre, aucune le 11 ou le 19, et les deux paliers de l’huile. Le schéma
correspond aux modèles et les comptages des tables sont conservés ; les
62 offres Metro/Super C sont inchangées. Les 29 tests spécifiques des paliers,
dont l’import et le retour de migration sur PostgreSQL local, passent ;
TypeScript, les 133 tests mobiles et les 11 exports de contrats sont validés.
Les essais de l’affichage sur appareil restent à effectuer.

## Premier import — état historique

Les trois lots sont achevés : 31 recherches, 310 observations brutes au maximum demandé, et 31 identifiants produits actuels retrouvés. Les formats fixes sont identiques ; aucun produit de remplacement n’a été sélectionné. La vérification porte sur la cohérence des réponses fournisseur et des références, pas sur les étiquettes en magasin.

16 références ont des champs de prix différents du fichier précédent. Les 31 dates de relevé sont actualisées. 30 références ont un montant source exposable ; l’huile d’olive est laissée à prix inconnu en raison de sa condition de quantité.

## Prix relevés et valeurs conservées

| Ingrédient | Identifiant | Ancien prix affichable | Montant source | Nouveau prix affichable | Promotion déclarée |
| --- | --- | --- | --- | --- | --- |
| Ail frais | `21004355001_EA` | 1.00 $ | 1 $ | 1.00 $ | Non |
| Oignon jaune | `20811994001_EA` | 3.29 $ | 2.5 $ | 2.50 $ | Non |
| Carotte fraîche | `20600927001_EA` | 4.00 $ | 2.5 $ | 2.50 $ | Oui |
| Banane fraîche | `20139509001_KG` | 2.64 $ | 2.64 $ | 2.64 $ | Non |
| Poitrine de poulet fraîche | `20028450_KG` | 18.14 $ | 18.14 $ | 18.14 $ | Non |
| Lait de vache 2 % | `20020563_EA` | 5.25 $ | 5 $ | 5.00 $ | Non |
| Œufs gros | `21435777001_EA` | 10.19 $ | 10.19 $ | 10.19 $ | Non |
| Riz basmati blanc sec | `20065191_EA` | 7.49 $ | 7.49 $ | 7.49 $ | Non |
| Pois chiches en conserve | `20325921001_EA` | 1.50 $ | 1.5 $ | 1.50 $ | Non |
| Huile d’olive | `20105368_EA` | 13.99 $ | 7.77 $ | inconnu | Oui |
| Tomate fraîche | `21367888001_EA` | 3.00 $ | 4.99 $ | 4.99 $ | Non |
| Pomme de terre fraîche | `20601017001_EA` | 6.79 $ | 4 $ | 4.00 $ | Oui |
| Poivron frais | `20921434001_EA` | 6.99 $ | 7.99 $ | 7.99 $ | Non |
| Brocoli frais | `21121560001_EA` | 0.95 $ | 2.79 $ | 2.79 $ | Non |
| Courgette fraîche | `20426596001_KG` | 1.41 $ | 2.15 $ | 2.15 $ | Non |
| Pomme fraîche | `20713211001_EA` | 3.49 $ | 7 $ | 7.00 $ | Non |
| Citron frais | `20028593001_EA` | 0.97 $ | 0.97 $ | 0.97 $ | Non |
| Bœuf haché cru | `21604443_EA` | 9.00 $ | 9 $ | 9.00 $ | Non |
| Saumon nature | `21634491_EA` | 17.00 $ | 19 $ | 19.00 $ | Non |
| Thon en conserve | `20521648_EA` | 1.39 $ | 1 $ | 1.00 $ | Oui |
| Crevettes nature | `20789931_EA` | 11.00 $ | 11 $ | 11.00 $ | Non |
| Fromage cheddar | `20975873_EA` | 9.29 $ | 9.29 $ | 9.29 $ | Non |
| Yogourt nature | `20165226001_EA` | 3.49 $ | 3.49 $ | 3.49 $ | Non |
| Beurre | `20325029_EA` | 5.50 $ | 6 $ | 6.00 $ | Non |
| Pâtes alimentaires sèches | `20315613006_EA` | 2.00 $ | 2 $ | 2.00 $ | Non |
| Haricots rouges en conserve | `20554593_EA` | 1.50 $ | 1.5 $ | 1.50 $ | Non |
| Tomates en conserve | `20314629001_EA` | 1.69 $ | 2.29 $ | 2.29 $ | Non |
| Farine de blé tout usage | `20013256_EA` | 4.00 $ | 3.79 $ | 3.79 $ | Non |
| Sucre blanc granulé | `20145033_EA` | 2.99 $ | 2.79 $ | 2.79 $ | Non |
| Sel de table | `20126203_EA` | 1.79 $ | 1.79 $ | 1.79 $ | Non |
| Pain tranché | `20038335_EA` | 4.00 $ | 4 $ | 4.00 $ | Non |

## Conditions et limites

- Huile d’olive Gallo 1 L : 7,77 $ relevés avec « Limit 4, after limit $10.00 » et mention PC Optimum Points. Cette mention de points ne prouve pas que le prix nécessite une carte. Le prix n’est pas exposé sans sa condition de quantité ; les deux champs de prix restent nuls dans le catalogue courant. Le montant après limite n’est pas assimilé à un prix régulier.
- Quatre références sont déclarées en promotion par Apify : carottes, pommes de terre, huile d’olive et thon. Aucune date de validité n’est fournie. Leurs anciennes dates ne sont pas réutilisées. La route filtrée sur les promotions actives ne peut donc pas confirmer ces rabais.
- Banane, poitrine de poulet et courgette : poids variable. Le montant retourné par le fournisseur ne constitue pas un prix normalisé au kilo ; quantité et unité fixes restent inconnues. Ne pas utiliser ces montants comme prix d’un paquet garanti ni dans des conversions automatiques.
- Le libellé du riz est désormais « Pure Basmati Rice » ; même identifiant, marque Tilda et format 907 g. La description locale a été conservée.
- `data_final/promos.json`, les circulaires et les prix Metro/Super C ne sont pas actualisés par cette opération.

## Traçabilité

- `produits-before.json` : fichier Maxi avant modification.
- `selection.json` : comparaison avant/après, conditions, unités de prix et références des runs.
- `../actualisation-2026-11-14-lot1/`, `lot2/`, `lot3/` : réponses brutes, catalogues et rapports.
- Plafonds demandés : 1 USD par lot, 3 USD au total ; application et facturation à vérifier auprès d’Apify.

## Import Supabase

Validation locale avant import : 111 tests catalogue/Apify/contrats réussis et
11 exports de contrats cohérents. Le test de lecture des prix accepte désormais
un montant nul uniquement lorsque sa nature est `unknown`, conformément au
contrat existant et au cas conditionnel de l’huile.

Import transactionnel effectué et vérifié sur Supabase : 31 offres Maxi actualisées, 93 offres au total. Les 62 offres Metro/Super C sont inchangées par rapport à la sauvegarde. Les identifiants des produits ont été conservés. Une lecture réelle via FastAPI en mode `OFFERS_SOURCE=database` confirme les 31 dates du 14 novembre, 30 montants disponibles et le prix inconnu de l’huile. Les promotions sans dates sont `unverifiable` et aucune n’est exposée comme promotion active. Voir `import-result.json` et `api-verification.json`.

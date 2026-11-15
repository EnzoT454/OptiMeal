import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from '../context/AuthContext';
import type { Retailer } from "../types/api";
import {
  ajouterManuel, chargerListe, comparerMagasins, ecrireMagasin,
  definirCocheStockee, definirDejaLaStocke, definirToujoursStocke, modifierChoix,
  ligneManuelle, lireChoix, lireCoches, lireDejaLa, lireMagasin, lireToujours,
  offreDeLigne, meilleureOffre, retirerManuel, totalMagasin, trier,
  type ArticleManuel, type ChoixProduits, type Contexte, type LigneListe, type Magasin,
} from "./shoppingList";

type ShoppingData = {
  userId: string | null;
  lignes: LigneListe[]; contexte: Contexte | null;
  coches: Set<string>; dejaLa: Set<string>; toujours: Set<string>;
  magasinChoisi: Magasin; choix: ChoixProduits;
  chargement: boolean; chargee: boolean; nbRepasExclus: number;
  erreurChargement: string | null; erreurEnregistrement: string | null;
};

function emptyData(userId: string | null): ShoppingData {
  return { userId, lignes: [], contexte: null, coches: new Set(), dejaLa: new Set(), toujours: new Set(),
    magasinChoisi: 'auto', choix: {}, chargement: userId !== null, chargee: false, nbRepasExclus: 0, erreurChargement: null, erreurEnregistrement: null };
}

// Les clés et les résultats asynchrones appartiennent au compte qui a lancé l'action.
export function useListeAchats() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const scopeRef = useRef({ userId });
  if (scopeRef.current.userId !== userId) scopeRef.current = { userId };
  const scope = scopeRef.current;
  const mounted = useRef(true);
  const dernierAppel = useRef(0);
  const echec = useRef<{ scope: typeof scope; key: string; run: () => Promise<boolean> } | null>(null);
  const [stored, setStored] = useState(() => emptyData(userId));
  // Masquer l'ancien compte dès le rendu, avant l'exécution des effets.
  const data = stored.userId === userId ? stored : emptyData(userId);
  const { lignes, contexte, coches, dejaLa, toujours, magasinChoisi, choix, chargement, erreurChargement, erreurEnregistrement, nbRepasExclus } = data;
  const erreur = erreurEnregistrement ?? erreurChargement;
  const avertissementRepas = nbRepasExclus > 0
    ? `Liste partielle : ${nbRepasExclus} repas sans recette accessible. Leurs ingrédients ne sont pas inclus.` : null;

  const update = useCallback((change: (previous: ShoppingData) => ShoppingData) => {
    if (!mounted.current || scopeRef.current !== scope) return;
    setStored(previous => {
      if (!mounted.current || scopeRef.current !== scope) return previous;
      return change(previous.userId === scope.userId ? previous : emptyData(scope.userId));
    });
  }, [scope]);

  const recharger = useCallback(async () => {
    if (scopeRef.current !== scope) return;
    const numero = ++dernierAppel.current;
    if (!userId) { update(() => emptyData(null)); return; }
    update(previous => ({ ...previous, chargement: true }));
    try {
      const [liste, cochesLus, dejaLaLus, toujoursLus, magasinLu] = await Promise.all([
        chargerListe(userId), lireCoches(userId), lireDejaLa(userId),
        lireToujours(userId), lireMagasin(userId),
      ]);
      const choixLu = await lireChoix(userId, [...liste.contexte.offresParIngredient.values()].flat());
      if (numero !== dernierAppel.current) return;
      update(previous => ({ ...previous, lignes: liste.lignes, contexte: liste.contexte,
        chargee: true, erreurChargement: null, nbRepasExclus: liste.nbRepasExclus, coches: cochesLus, dejaLa: dejaLaLus, toujours: toujoursLus, magasinChoisi: magasinLu, choix: choixLu }));
    } catch {
      if (numero === dernierAppel.current) update(previous => ({ ...previous,
        erreurChargement: previous.chargee
          ? "Actualisation impossible. La dernière liste chargée est conservée ; elle peut différer du calendrier actuel. Réessaie."
          : "Impossible de charger une liste complète. Vérifie ta connexion et réessaie." }));
    } finally {
      if (numero === dernierAppel.current) update(previous => ({ ...previous, chargement: false }));
    }
  }, [scope, userId, update]);

  useEffect(() => {
    mounted.current = true;
    void recharger();
    return () => { mounted.current = false; dernierAppel.current++; };
  }, [recharger]);

  async function modifier<T>(key: string, operation: () => Promise<T>, change: (previous: ShoppingData, result: T) => ShoppingData): Promise<boolean> {
    if (!userId || !mounted.current || scopeRef.current !== scope) return false;
    dernierAppel.current++;
    try {
      const result = await operation();
      if (!mounted.current || scopeRef.current !== scope) return false;
      const memeEchec = echec.current?.scope === scope && echec.current.key === key;
      if (memeEchec) echec.current = null;
      update(previous => ({ ...change(previous, result), chargement: false,
        erreurEnregistrement: memeEchec ? null : previous.erreurEnregistrement }));
      if (chargement) void recharger();
      return true;
    } catch {
      if (!mounted.current || scopeRef.current !== scope) return false;
      echec.current = { scope, key, run: () => modifier(key, operation, change) };
      update(previous => ({ ...previous, chargement: false,
        erreurEnregistrement: "Modification non enregistrée. Réessaie l’enregistrement." }));
      return false;
    }
  }
  const reessayerEnregistrement = async () => {
    const tentative = echec.current;
    if (tentative?.scope === scope && scopeRef.current === scope) return tentative.run();
    return false;
  };

  const choisirMagasin = (magasinChoisi: Retailer) => modifier("magasin",
    () => ecrireMagasin(userId, magasinChoisi), previous => ({ ...previous, magasinChoisi }));
  const basculerCoche = (id: string) => modifier(`coches:${id}`,
    () => definirCocheStockee(userId, id, !coches.has(id)), (previous, coches) => ({ ...previous, coches }));
  const basculerDejaLa = (id: string) => modifier(`dejaLa:${id}`,
    () => definirDejaLaStocke(userId, id, !dejaLa.has(id)), (previous, dejaLa) => ({ ...previous, dejaLa }));
  const basculerToujours = (id: string) => modifier(`toujours:${id}`,
    () => definirToujoursStocke(userId, id, !toujours.has(id)), (previous, toujours) => ({ ...previous, toujours }));
  const choisirProduit = (ligneId: string, produitId: string | null) => modifier(`choix:${ligneId}`,
    () => modifierChoix(userId, ligneId, produitId), (previous, choix) => ({ ...previous, choix }));

  function remplacerManuels(previous: ShoppingData, manuels: ArticleManuel[]): ShoppingData {
    return { ...previous, lignes: trier([
      ...previous.lignes.filter(l => !l.manuel),
      ...manuels.map(a => ligneManuelle(a, previous.contexte ?? undefined)),
    ]) };
  }
  const ajouter = (nom: string, ingredientId: string | null = null) => modifier(`ajout:${ingredientId}:${nom}`,
    () => ajouterManuel(userId, nom, ingredientId), remplacerManuels);
  const supprimer = async (ligne: LigneListe) => {
    if (!ligne.manuel) return;
    await modifier(`retrait:${ligne.ingredient_id}`, () => retirerManuel(userId, ligne.ingredient_id.replace('manuel:', '')), remplacerManuels);
  };

  const nbChoixAbsents = lignes.filter(l => choix[l.ingredient_id] &&
    !l.offres.some(o => o.product_id === choix[l.ingredient_id] || o.id === choix[l.ingredient_id])).length;
  const avertissement = [avertissementRepas, nbChoixAbsents > 0
    ? `${nbChoixAbsents} choix de produit à vérifier : référence absente du catalogue actuel. Le produit proposé par défaut est affiché.` : null]
    .filter(Boolean).join(' ') || null;

  const aToujours = (l: LigneListe) => l.catalogue_id !== null && toujours.has(l.catalogue_id);
  const chezMoi = lignes.filter(l => aToujours(l) || dejaLa.has(l.ingredient_id));
  const restantes = lignes.filter(l => !aToujours(l) && !dejaLa.has(l.ingredient_id));
  const aAcheterTout = restantes.filter(l => !coches.has(l.ingredient_id));
  const cochees = restantes.filter(l => coches.has(l.ingredient_id));
  const magasin: Retailer = magasinChoisi !== 'auto'
    ? magasinChoisi : (comparerMagasins(aAcheterTout)[0]?.magasin ?? 'superc');
  const offreDe = (l: LigneListe) => offreDeLigne(l, magasin, choix);
  const pasIci = aAcheterTout.filter(l => !offreDe(l) && meilleureOffre(l));
  const aAcheter = aAcheterTout.filter(l => !pasIci.includes(l));
  const totaux = totalMagasin(aAcheter, magasin, choix);

  return { lignes, contexte, coches, dejaLa, toujours, choix, magasin, magasinAuto: magasinChoisi === 'auto', offreDe,
    chargement, erreur, erreurChargement, erreurEnregistrement, avertissement, nbRepasExclus, aAcheter, pasIci, cochees, chezMoi, totaux, nbAAcheter: aAcheterTout.length,
    recharger, reessayerEnregistrement, choisirMagasin, choisirProduit, basculerCoche, basculerDejaLa, basculerToujours, ajouter, supprimer };
}

export type ListeAchats = ReturnType<typeof useListeAchats>;

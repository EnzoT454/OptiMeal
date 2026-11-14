import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from '../context/AuthContext';
import type { Retailer } from "../types/api";
import {
  ajouterManuel, chargerListe, comparerMagasins, ecrireMagasin,
  basculerCocheStockee, basculerDejaLaStocke, basculerToujoursStocke, modifierChoix,
  ligneManuelle, lireChoix, lireCoches, lireDejaLa, lireMagasin, lireToujours,
  offreDeLigne, meilleureOffre, retirerManuel, totalMagasin, trier,
  type ArticleManuel, type ChoixProduits, type Contexte, type LigneListe, type Magasin,
} from "./shoppingList";

type ShoppingData = {
  userId: string | null;
  lignes: LigneListe[]; contexte: Contexte | null;
  coches: Set<string>; dejaLa: Set<string>; toujours: Set<string>;
  magasinChoisi: Magasin; choix: ChoixProduits;
  chargement: boolean; erreur: string | null;
};

function emptyData(userId: string | null): ShoppingData {
  return { userId, lignes: [], contexte: null, coches: new Set(), dejaLa: new Set(), toujours: new Set(),
    magasinChoisi: 'auto', choix: {}, chargement: userId !== null, erreur: null };
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
  const [stored, setStored] = useState(() => emptyData(userId));
  // Masquer l'ancien compte dès le rendu, avant l'exécution des effets.
  const data = stored.userId === userId ? stored : emptyData(userId);
  const { lignes, contexte, coches, dejaLa, toujours, magasinChoisi, choix, chargement, erreur } = data;

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
    update(previous => ({ ...previous, chargement: true, erreur: null }));
    try {
      const [liste, cochesLus, dejaLaLus, toujoursLus, magasinLu, choixLu] = await Promise.all([
        chargerListe(userId), lireCoches(userId), lireDejaLa(userId),
        lireToujours(userId), lireMagasin(userId), lireChoix(userId),
      ]);
      if (numero !== dernierAppel.current) return;
      update(previous => ({ ...previous, lignes: liste.lignes, contexte: liste.contexte,
        coches: cochesLus, dejaLa: dejaLaLus, toujours: toujoursLus, magasinChoisi: magasinLu, choix: choixLu }));
    } catch {
      if (numero === dernierAppel.current) update(previous => ({ ...previous,
        erreur: "Impossible de charger ta liste. Vérifie ta connexion et réessaie." }));
    } finally {
      if (numero === dernierAppel.current) update(previous => ({ ...previous, chargement: false }));
    }
  }, [scope, userId, update]);

  useEffect(() => {
    mounted.current = true;
    void recharger();
    return () => { mounted.current = false; dernierAppel.current++; };
  }, [recharger]);

  async function modifier<T>(operation: () => Promise<T>, change: (previous: ShoppingData, result: T) => ShoppingData) {
    if (!userId || !mounted.current || scopeRef.current !== scope) return;
    // Un chargement commencé avant la mutation ne doit pas rétablir l'ancien état.
    dernierAppel.current++;
    try {
      const result = await operation();
      update(previous => ({ ...change(previous, result), chargement: false, erreur: null }));
      if (chargement) void recharger();
    } catch {
      update(previous => ({ ...previous, chargement: false, erreur: "Impossible d’enregistrer ta liste. Réessaie." }));
    }
  }

  const choisirMagasin = (magasinChoisi: Retailer) => modifier(
    () => ecrireMagasin(userId, magasinChoisi), previous => ({ ...previous, magasinChoisi }));
  const basculerCoche = (id: string) => modifier(
    () => basculerCocheStockee(userId, id), (previous, coches) => ({ ...previous, coches }));
  const basculerDejaLa = (id: string) => modifier(
    () => basculerDejaLaStocke(userId, id), (previous, dejaLa) => ({ ...previous, dejaLa }));
  const basculerToujours = (id: string) => modifier(
    () => basculerToujoursStocke(userId, id), (previous, toujours) => ({ ...previous, toujours }));
  const choisirProduit = (ligneId: string, offreId: string | null) => modifier(
    () => modifierChoix(userId, ligneId, offreId), (previous, choix) => ({ ...previous, choix }));

  function remplacerManuels(previous: ShoppingData, manuels: ArticleManuel[]): ShoppingData {
    return { ...previous, lignes: trier([
      ...previous.lignes.filter(l => !l.manuel),
      ...manuels.map(a => ligneManuelle(a, previous.contexte ?? undefined)),
    ]) };
  }
  const ajouter = (nom: string, ingredientId: string | null = null) => modifier(
    () => ajouterManuel(userId, nom, ingredientId), remplacerManuels);
  const supprimer = async (ligne: LigneListe) => {
    if (!ligne.manuel) return;
    await modifier(() => retirerManuel(userId, ligne.ingredient_id.replace('manuel:', '')), remplacerManuels);
  };

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
    chargement, erreur, aAcheter, pasIci, cochees, chezMoi, totaux, nbAAcheter: aAcheterTout.length,
    recharger, choisirMagasin, choisirProduit, basculerCoche, basculerDejaLa, basculerToujours, ajouter, supprimer };
}

export type ListeAchats = ReturnType<typeof useListeAchats>;

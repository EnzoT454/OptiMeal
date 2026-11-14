import { useCallback, useEffect, useRef, useState } from "react";
import type { Retailer } from "../types/api";
import {
  ajouterManuel, chargerListe, comparerMagasins, ecrireChoix, ecrireCoches, ecrireDejaLa, ecrireMagasin,
  ecrireToujours, ligneManuelle, lireChoix, lireCoches, lireDejaLa, lireMagasin, lireToujours,
  offreDeLigne, meilleureOffre, retirerManuel, totalMagasin, trier,
  type ArticleManuel, type ChoixProduits, type Contexte, type LigneListe, type Magasin,
} from "./shoppingList";

// =====================================================================
// Hook de la liste d'épicerie de la semaine : données + actions au même
// endroit. Utilisé par le Calendrier (vue Épicerie) et par l'Accueil.
//
// 3 façons de sortir un article de « À acheter » :
//   - cocher           → mis dans le panier au magasin (cette semaine)
//   - J'en ai déjà     → pas besoin de l'acheter (cette semaine)
//   - J'en ai toujours → ne revient plus jamais (ingrédients du catalogue)
// =====================================================================

export function useListeAchats() {
  const [lignes, setLignes] = useState<LigneListe[]>([]);
  const [contexte, setContexte] = useState<Contexte | null>(null);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [dejaLa, setDejaLa] = useState<Set<string>>(new Set());
  const [toujours, setToujours] = useState<Set<string>>(new Set());
  const [magasinChoisi, setMagasinChoisi] = useState<Magasin>("auto");
  const [choix, setChoix] = useState<ChoixProduits>({}); // produit choisi dans la fiche, par article
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  // Si on recharge 2 fois de suite, seule la réponse du dernier appel compte
  const dernierAppel = useRef(0);

  const recharger = useCallback(async () => {
    const numero = ++dernierAppel.current;
    setChargement(true);
    setErreur(null);
    try {
      const [{ lignes: liste, contexte: ctx }, cochesLus, dejaLaLus, toujoursLus, magasinLu, choixLu] = await Promise.all([
        chargerListe(),
        lireCoches(),
        lireDejaLa(),
        lireToujours(),
        lireMagasin(),
        lireChoix(),
      ]);
      if (numero !== dernierAppel.current) return; // un appel plus récent est en cours
      setLignes(liste);
      setContexte(ctx);
      setCoches(cochesLus);
      setDejaLa(dejaLaLus);
      setToujours(toujoursLus);
      setMagasinChoisi(magasinLu);
      setChoix(choixLu);
    } catch {
      if (numero === dernierAppel.current) setErreur("Impossible de charger ta liste. Vérifie ta connexion et réessaie.");
    } finally {
      if (numero === dernierAppel.current) setChargement(false);
    }
  }, []);

  useEffect(() => {
    recharger();
  }, [recharger]);

  // ---- Actions ----

  function choisirMagasin(m: Retailer) {
    setMagasinChoisi(m);
    ecrireMagasin(m).catch(() => {});
  }

  // Ajoute ou enlève un id d'un ensemble, et l'enregistre
  function basculer(setter: typeof setCoches, ecrire: (ids: Set<string>) => Promise<void>, id: string) {
    setter((avant) => {
      const nouveau = new Set(avant);
      if (nouveau.has(id)) nouveau.delete(id);
      else nouveau.add(id);
      ecrire(nouveau).catch(() => {});
      return nouveau;
    });
  }

  const basculerCoche = (id: string) => basculer(setCoches, ecrireCoches, id);
  const basculerDejaLa = (id: string) => basculer(setDejaLa, ecrireDejaLa, id);
  // « J'en ai toujours » se retient par ingrédient du catalogue (pas par ligne)
  const basculerToujours = (catalogueId: string) => basculer(setToujours, ecrireToujours, catalogueId);

  // Choisir un produit précis pour un article (dans n'importe quel magasin). null = revenir au choix automatique
  function choisirProduit(ligneId: string, offreId: string | null) {
    setChoix((avant) => {
      const nouveau = { ...avant };
      if (offreId) nouveau[ligneId] = offreId;
      else delete nouveau[ligneId];
      ecrireChoix(nouveau).catch(() => {});
      return nouveau;
    });
  }

  // Remplacer les articles manuels affichés, sans tout recharger
  function remplacerManuels(manuels: ArticleManuel[]) {
    setLignes((avant) => trier([
      ...avant.filter((l) => !l.manuel),
      ...manuels.map((a) => ligneManuelle(a, contexte ?? undefined)),
    ]));
  }

  // nom = ce qui est affiché ; ingredientId = l'ingrédient choisi dans les suggestions (null = hors catalogue)
  async function ajouter(nom: string, ingredientId: string | null = null) {
    try {
      remplacerManuels(await ajouterManuel(nom, ingredientId));
    } catch {
      setErreur("Impossible d'ajouter cet article.");
    }
  }

  async function supprimer(ligne: LigneListe) {
    if (!ligne.manuel) return;
    try {
      remplacerManuels(await retirerManuel(ligne.ingredient_id.replace("manuel:", "")));
    } catch {
      setErreur("Impossible de retirer cet article.");
    }
  }

  // ---- Ce qu'on affiche ----
  const aToujours = (l: LigneListe) => l.catalogue_id !== null && toujours.has(l.catalogue_id);
  const chezMoi = lignes.filter((l) => aToujours(l) || dejaLa.has(l.ingredient_id));
  const restantes = lignes.filter((l) => !aToujours(l) && !dejaLa.has(l.ingredient_id));
  const aAcheterTout = restantes.filter((l) => !coches.has(l.ingredient_id));
  const cochees = restantes.filter((l) => coches.has(l.ingredient_id));

  // Le magasin : celui choisi, sinon le moins cher pour toute la liste (un seul magasin à la fois)
  const magasin: Retailer = magasinChoisi !== "auto"
    ? magasinChoisi
    : (comparerMagasins(aAcheterTout)[0]?.magasin ?? "superc");

  // Le produit retenu pour une ligne (choisi dans la fiche, sinon le moins cher du magasin)
  const offreDe = (l: LigneListe) => offreDeLigne(l, magasin, choix);

  // Articles vendus ailleurs, mais pas dans ce magasin (et pas choisis ailleurs) : section à part
  const pasIci = aAcheterTout.filter((l) => !offreDe(l) && meilleureOffre(l));
  const aAcheter = aAcheterTout.filter((l) => !pasIci.includes(l));
  const totaux = totalMagasin(aAcheter, magasin, choix);

  return {
    lignes, contexte, coches, dejaLa, toujours, choix, magasin, magasinAuto: magasinChoisi === "auto", offreDe,
    chargement, erreur,
    aAcheter, pasIci, cochees, chezMoi, totaux, nbAAcheter: aAcheterTout.length,
    recharger, choisirMagasin, choisirProduit, basculerCoche, basculerDejaLa, basculerToujours, ajouter, supprimer,
  };
}

export type ListeAchats = ReturnType<typeof useListeAchats>;
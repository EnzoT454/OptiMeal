import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { Profile } from '../types/api';
import { Message } from '../components/ui';
import { RecipeScreen, recipeColors as c } from '../components/recipes';

type NomIcone = ComponentProps<typeof MaterialCommunityIcons>['name'];

const ROUGE = '#a32d2d';

export default function ProfileScreen() {
  const { session, requestSignIn, forgetDeletedAccount } = useAuth();
  const userId = session?.user.id;

  // L'ordre des 5 premiers états est celui d'origine : les tests y accèdent par position.
  const [name, setName] = useState('');
  const [erreur, setErreur] = useState('');               // seulement les erreurs (en rouge)
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [nomEnregistre, setNomEnregistre] = useState(''); // le nom tel qu'il est dans le compte
  const [confirme, setConfirme] = useState(false);        // "✓ Enregistré" pendant 2 secondes
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nomModifie = name.trim() !== nomEnregistre.trim();

  // Arrêter la minuterie si on quitte l'écran
  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current); }, []);

  // Charger le profil chaque fois qu'on ouvre l'écran
  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let active = true;
    api<Profile>('/api/v1/me')
      .then(profile => {
        if (!active) return;
        setName(profile.display_name ?? '');
        setNomEnregistre(profile.display_name ?? '');
      })
      .catch(e => { if (active) setErreur(e.message); });
    return () => { active = false; };
  }, [userId]));

  async function save() {
    setBusy(true); setErreur('');
    try {
      const nouveau = name.trim();
      await api<Profile>('/api/v1/me', { method: 'PATCH', body: JSON.stringify({ display_name: nouveau || null }) });
      setName(nouveau);
      setNomEnregistre(nouveau);
      setConfirme(true);
      if (minuterie.current) clearTimeout(minuterie.current);
      minuterie.current = setTimeout(() => setConfirme(false), 2000);
    } catch (e) { setErreur((e as Error).message); } finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    try { const { error } = await supabase.auth.signOut({ scope: 'local' }); if (error) setErreur('Déconnexion impossible. Réessaie.'); }
    catch { setErreur('Déconnexion impossible. Réessaie.'); } finally { setBusy(false); }
  }

  async function deleteAccount() {
    if (!session || busy || confirmation !== 'SUPPRIMER') return;
    setBusy(true); setErreur('');
    try {
      await api<void>('/api/v1/me', { method: 'DELETE', body: JSON.stringify({ confirmation: 'SUPPRIMER' }) }, false, 60000);
    } catch (e) {
      setErreur((e as Error).message); setBusy(false); return;
    }
    // La suppression distante a réussi ; retirer aussi la session de cet appareil.
    try { await forgetDeletedAccount(); }
    catch { Alert.alert('Compte supprimé', 'Le compte a été supprimé, mais le nettoyage de la session sur cet appareil a rencontré une erreur.'); }
    finally { setBusy(false); }
  }

  // Petit pied de page discret (remplace la section « À propos »)
  const piedDePage = <Text style={styles.piedDePage}>OptiMeal</Text>;

  // ---------- Visiteur (pas connecté) ----------
  if (!session) return (
    <RecipeScreen avecEntete>
      <View style={styles.carte}>
        <View style={styles.bloc}>
          <Text style={styles.titreCarte}>Tu utilises OptiMeal sans compte</Text>
          <Text style={styles.texte}>
            Tu peux consulter les recettes, les promotions et les circulaires. Connecte-toi pour accéder à ton profil
            et à tes paramètres.
          </Text>
          <Bouton titre="Se connecter ou créer un compte"
            onPress={() => requestSignIn('Connecte-toi pour accéder aux paramètres de ton profil.')} />
        </View>
      </View>
      {piedDePage}
    </RecipeScreen>
  );

  // ---------- Connecté ----------
  return (
    <RecipeScreen avecEntete>
      {/* Carte du profil : initiale, nom et courriel complet */}
      <View style={[styles.carte, styles.profil]}>
        <View style={styles.avatar}>
          {nomEnregistre.trim()
            ? <Text style={styles.initiale}>{nomEnregistre.trim().charAt(0).toUpperCase()}</Text>
            : <MaterialCommunityIcons name="account-outline" size={28} color={c.green} accessible={false} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.nomProfil} numberOfLines={1}>{nomEnregistre.trim() || 'Ton compte'}</Text>
          <Text style={styles.courriel} numberOfLines={1} ellipsizeMode="middle">{session.user.email ?? ''}</Text>
        </View>
      </View>

      <Section titre="Nom affiché">
        <View style={styles.bloc}>
          <TextInput
            value={name}
            onChangeText={(texte) => { setName(texte); setConfirme(false); }}
            maxLength={80}
            placeholder="Ton nom"
            placeholderTextColor={c.muted}
            style={styles.champ}
            accessibilityLabel="Nom affiché"
          />
          {/* Le bouton apparaît seulement quand il y a quelque chose à enregistrer */}
          {(nomModifie || confirme || busy) && (
            <Bouton
              titre={confirme ? '✓ Enregistré' : busy ? 'Enregistrement…' : 'Enregistrer'}
              disabled={busy || !nomModifie}
              succes={confirme}
              onPress={() => void save()}
            />
          )}
        </View>
      </Section>

      <Message text={erreur} />

      <Section titre="Session">
        <Ligne icone="logout" titre="Se déconnecter" onPress={() => void logout()} disabled={busy} />
        <Ligne icone="delete-outline" titre="Supprimer mon compte" danger derniere disabled={busy}
          onPress={() => { setConfirmDelete(true); setErreur(''); }} />
      </Section>

      {confirmDelete && (
        <View style={[styles.carte, styles.carteDanger]}>
          <View style={styles.bloc}>
            <Text style={[styles.titreCarte, { color: ROUGE }]}>Supprimer définitivement mon compte</Text>
            <Text style={styles.texte}>
              Ton compte, ton profil, tes recettes privées, tes favoris et tes repas planifiés seront supprimés. Tes recettes
              publiques et leurs photos resteront accessibles à la communauté, sans lien avec ton compte. Cette action est
              irréversible.
            </Text>
            <Text style={styles.texte}>Si la suppression est interrompue, certaines photos peuvent déjà avoir été retirées.</Text>
            <Text style={styles.etiquette}>Écris SUPPRIMER pour confirmer</Text>
            <TextInput
              value={confirmation}
              onChangeText={setConfirmation}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!busy}
              style={styles.champ}
              accessibilityLabel="Écris SUPPRIMER pour confirmer"
            />
            <Bouton titre={busy ? 'Suppression…' : 'Confirmer la suppression'} danger
              disabled={busy || confirmation !== 'SUPPRIMER'} onPress={() => void deleteAccount()} />
            <Bouton titre="Annuler" secondaire disabled={busy}
              onPress={() => { setConfirmDelete(false); setConfirmation(''); setErreur(''); }} />
          </View>
        </View>
      )}

      {piedDePage}
    </RecipeScreen>
  );
}

// ---------- Petits composants de mise en page ----------

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.titreSection}>{titre}</Text>
      <View style={styles.carte}>{children}</View>
    </View>
  );
}

function Ligne({ icone, titre, valeur, onPress, danger = false, derniere = false, disabled = false }: {
  icone: NomIcone; titre: string; valeur?: string; onPress?: () => void;
  danger?: boolean; derniere?: boolean; disabled?: boolean;
}) {
  const contenu = (
    <>
      <MaterialCommunityIcons name={icone} size={22} color={danger ? ROUGE : c.muted} accessible={false} />
      <Text style={[styles.texteLigne, { flex: 1 }, danger && { color: ROUGE }]} numberOfLines={1}>{titre}</Text>
      {valeur ? <Text style={styles.valeur} numberOfLines={1}>{valeur}</Text> : null}
      {onPress && !danger ? <MaterialCommunityIcons name="chevron-right" size={22} color={c.muted} accessible={false} /> : null}
    </>
  );
  const style = [styles.ligne, !derniere && styles.separateur];
  if (!onPress) return <View style={style}>{contenu}</View>;
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={({ pressed }) => [...style, pressed && styles.appuye, disabled && { opacity: 0.5 }]}>
      {contenu}
    </Pressable>
  );
}

function Bouton({ titre, onPress, disabled = false, danger = false, secondaire = false, succes = false }: {
  titre: string; onPress: () => void; disabled?: boolean; danger?: boolean; secondaire?: boolean; succes?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titre}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.bouton,
        danger && { backgroundColor: ROUGE },
        secondaire && styles.boutonSecondaire,
        succes && styles.boutonSucces,
        disabled && !succes && styles.boutonInactif,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.texteBouton, secondaire && { color: c.ink }, disabled && !succes && styles.texteInactif]}>{titre}</Text>
    </Pressable>
  );
}

const OMBRE = {
  shadowColor: '#1a2e22',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

const styles = StyleSheet.create({
  titreSection: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: c.muted, marginLeft: 4 },
  carte: { backgroundColor: 'white', borderRadius: 20, overflow: 'hidden', ...OMBRE },
  carteDanger: { borderWidth: 1, borderColor: ROUGE },
  bloc: { padding: 16, gap: 10 },
  titreCarte: { fontFamily: 'DMSans_700Bold', fontSize: 17, lineHeight: 23, color: c.ink },
  texte: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20, color: c.ink },

  ligne: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16 },
  separateur: { borderBottomWidth: 1, borderBottomColor: c.border },
  texteLigne: { fontFamily: 'DMSans_500Medium', fontSize: 15, lineHeight: 20, color: c.ink },
  valeur: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 19, color: c.muted, maxWidth: '55%' },
  appuye: { backgroundColor: c.light },
  profil: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: c.light },
  initiale: { fontFamily: 'DMSans_700Bold', fontSize: 24, lineHeight: 30, color: c.green },
  nomProfil: { fontFamily: 'DMSans_700Bold', fontSize: 18, lineHeight: 24, color: c.ink },
  courriel: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 19, color: c.muted },
  piedDePage: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: c.muted, textAlign: 'center', marginTop: 16 },

  etiquette: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: c.muted },
  champ: {
    fontFamily: 'DMSans_400Regular', fontSize: 15, color: c.ink,
    borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, minHeight: 48, backgroundColor: c.background,
  },

  bouton: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.green, paddingHorizontal: 16 },
  boutonSecondaire: { backgroundColor: 'white', borderWidth: 1, borderColor: c.border },
  boutonSucces: { backgroundColor: '#2e7d4f' },
  boutonInactif: { backgroundColor: c.light },
  texteBouton: { fontFamily: 'DMSans_700Bold', fontSize: 15, color: 'white' },
  texteInactif: { color: c.muted },
});
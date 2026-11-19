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

  const [name, setName] = useState('');
  const [nomEnregistre, setNomEnregistre] = useState(''); // le nom tel qu'il est dans le compte
  const [erreur, setErreur] = useState('');               // seulement les erreurs (en rouge)
  const [confirme, setConfirme] = useState(false);        // "✓ Enregistré" pendant 2 secondes
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmation, setConfirmation] = useState('');
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

  const aPropos = (
    <Section titre="À propos">
      <Ligne icone="food-apple-outline" titre="Application" valeur="OptiMeal" />
      <Ligne icone="school-outline" titre="Projet" valeur="IFT3150 · UdeM" derniere />
    </Section>
  );

  // ---------- Visiteur (pas connecté) ----------
  if (!session) return (
    <RecipeScreen>
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
      {aPropos}
    </RecipeScreen>
  );

  // ---------- Connecté ----------
  return (
    <RecipeScreen>
      <Section titre="Compte">
        <Ligne icone="email-outline" titre="Courriel" valeur={session.user.email ?? ''} />
        <View style={styles.bloc}>
          <Text style={styles.etiquette}>Nom affiché</Text>
          <TextInput
            value={name}
            onChangeText={(texte) => { setName(texte); setConfirme(false); }}
            maxLength={80}
            placeholder="Ton nom"
            placeholderTextColor={c.muted}
            style={styles.champ}
            accessibilityLabel="Nom affiché"
          />
          <Bouton
            titre={confirme ? '✓ Enregistré' : busy ? 'Enregistrement…' : 'Enregistrer'}
            disabled={busy || !nomModifie}
            succes={confirme}
            onPress={() => void save()}
          />
        </View>
      </Section>

      <Message text={erreur} />

      {aPropos}

      <Section titre="Session">
        <Ligne icone="logout" titre="Se déconnecter de cet appareil" onPress={() => void logout()} disabled={busy} />
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
      <Text style={[styles.texteLigne, { flex: 1 }, danger && { color: ROUGE }]}>{titre}</Text>
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
import { useCallback, useState } from 'react';
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
import { storeName } from '../components/promos';
import { ecrireMagasin, lireMagasin, type Magasin } from '../components/shoppingList';

type NomIcone = ComponentProps<typeof MaterialCommunityIcons>['name'];

const ROUGE = '#a32d2d';
// 'auto' = le magasin le moins cher pour la liste (comme dans l'épicerie)
const MAGASINS: Magasin[] = ['auto', 'maxi', 'metro', 'superc'];
const nomMagasin = (m: Magasin) => (m === 'auto' ? 'Le moins cher' : storeName(m));

export default function ProfileScreen() {
  const { session, requestSignIn, forgetDeletedAccount } = useAuth();
  const userId = session?.user.id;

  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [magasin, setMagasin] = useState<Magasin | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmation, setConfirmation] = useState('');

  // Charger le profil et le magasin chaque fois qu'on ouvre l'écran
  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let active = true;
    api<Profile>('/api/v1/me')
      .then(profile => { if (active) setName(profile.display_name ?? ''); })
      .catch(e => { if (active) setMessage(e.message); });
    lireMagasin(userId)
      .then(m => { if (active) setMagasin(m); })
      .catch(() => { if (active) setMagasin('auto'); });
    return () => { active = false; };
  }, [userId]));

  async function save() {
    setBusy(true); setMessage('');
    try {
      await api<Profile>('/api/v1/me', { method: 'PATCH', body: JSON.stringify({ display_name: name.trim() || null }) });
      setMessage('Profil enregistré.');
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }

  async function choisirMagasin(m: Magasin) {
    if (!userId) return;
    const avant = magasin;
    setMagasin(m); // affichage immédiat
    try { await ecrireMagasin(userId, m); }
    catch { setMagasin(avant); setMessage('Magasin non enregistré. Réessaie.'); }
  }

  async function logout() {
    setBusy(true);
    try { const { error } = await supabase.auth.signOut({ scope: 'local' }); if (error) setMessage('Déconnexion impossible. Réessaie.'); }
    catch { setMessage('Déconnexion impossible. Réessaie.'); } finally { setBusy(false); }
  }

  async function deleteAccount() {
    if (!session || busy || confirmation !== 'SUPPRIMER') return;
    setBusy(true); setMessage('');
    try {
      await api<void>('/api/v1/me', { method: 'DELETE', body: JSON.stringify({ confirmation: 'SUPPRIMER' }) }, false, 60000);
    } catch (e) {
      setMessage((e as Error).message); setBusy(false); return;
    }
    // La suppression distante a réussi ; retirer aussi la session de cet appareil.
    try { await forgetDeletedAccount(); }
    catch { Alert.alert('Compte supprimé', 'Le compte a été supprimé, mais le nettoyage de la session sur cet appareil a rencontré une erreur.'); }
    finally { setBusy(false); }
  }

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
            onChangeText={setName}
            maxLength={80}
            placeholder="Ton nom"
            placeholderTextColor={c.muted}
            style={styles.champ}
            accessibilityLabel="Nom affiché"
          />
          <Bouton titre="Enregistrer" disabled={busy} onPress={() => void save()} />
        </View>
      </Section>

      <Section titre="Épicerie">
        <View style={styles.bloc}>
          <View style={styles.ligneTitre}>
            <MaterialCommunityIcons name="storefront-outline" size={22} color={c.muted} accessible={false} />
            <Text style={styles.texteLigne}>Magasin par défaut</Text>
          </View>
          <View style={styles.puces}>
            {MAGASINS.map(m => {
              const actif = magasin === m;
              return (
                <Pressable
                  key={m}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: actif }}
                  onPress={() => void choisirMagasin(m)}
                  style={[styles.puce, actif && styles.puceActive]}
                >
                  <Text style={[styles.textePuce, actif && styles.textePuceActive]}>{nomMagasin(m)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.note}>Utilisé pour estimer le prix de ta liste d'épicerie.</Text>
        </View>
      </Section>

      <Message text={message} />

      <Section titre="Session">
        <Ligne icone="logout" titre="Se déconnecter de cet appareil" onPress={() => void logout()} disabled={busy} />
        <Ligne icone="delete-outline" titre="Supprimer mon compte" danger derniere disabled={busy}
          onPress={() => { setConfirmDelete(true); setMessage(''); }} />
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
              onPress={() => { setConfirmDelete(false); setConfirmation(''); setMessage(''); }} />
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

function Bouton({ titre, onPress, disabled = false, danger = false, secondaire = false }: {
  titre: string; onPress: () => void; disabled?: boolean; danger?: boolean; secondaire?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.bouton,
        danger && { backgroundColor: ROUGE },
        secondaire && styles.boutonSecondaire,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.texteBouton, secondaire && { color: c.ink }]}>{titre}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titreSection: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: c.muted, marginLeft: 4 },
  carte: { backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  carteDanger: { borderColor: ROUGE },
  bloc: { padding: 16, gap: 10 },
  titreCarte: { fontFamily: 'DMSans_700Bold', fontSize: 17, lineHeight: 23, color: c.ink },
  texte: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20, color: c.ink },
  note: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 16, color: c.muted },

  ligne: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16 },
  separateur: { borderBottomWidth: 1, borderBottomColor: c.border },
  ligneTitre: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  texteLigne: { fontFamily: 'DMSans_500Medium', fontSize: 15, lineHeight: 20, color: c.ink },
  valeur: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 19, color: c.muted, maxWidth: '55%' },
  appuye: { backgroundColor: c.light },

  etiquette: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: c.muted },
  champ: {
    fontFamily: 'DMSans_400Regular', fontSize: 15, color: c.ink,
    borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, minHeight: 48, backgroundColor: c.background,
  },

  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  puce: { paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: 'white' },
  puceActive: { backgroundColor: c.green, borderColor: c.green },
  textePuce: { fontFamily: 'DMSans_500Medium', fontSize: 14, color: c.ink },
  textePuceActive: { color: 'white' },

  bouton: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.green, paddingHorizontal: 16 },
  boutonSecondaire: { backgroundColor: 'white', borderWidth: 1, borderColor: c.border },
  texteBouton: { fontFamily: 'DMSans_700Bold', fontSize: 15, color: 'white' },
});
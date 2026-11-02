import { useCallback, useState } from 'react';
import { Alert, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { Profile } from '../types/api';
import { Button, Field, Heading, Message, Screen } from '../components/ui';

export default function ProfileScreen() {
  const { session, requestSignIn, forgetDeletedAccount } = useAuth();
  const userId = session?.user.id;
  const [name, setName] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let active = true;
    api<Profile>('/api/v1/me').then(profile => { if (active) setName(profile.display_name ?? ''); })
      .catch(e => { if (active) setMessage(e.message); });
    return () => { active = false; };
  }, [userId]));
  async function save() {
    setBusy(true);
    try { await api<Profile>('/api/v1/me', { method: 'PATCH', body: JSON.stringify({ display_name: name.trim() || null }) }); setMessage('Profil enregistré.'); }
    catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
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
  if (!session) return <Screen><Heading>Paramètres</Heading>
    <Text>Tu utilises OptiMeal sans compte. Tu peux consulter les recettes, les promotions et les circulaires.</Text>
    <Text>Connecte-toi pour accéder à ton profil et modifier tes informations.</Text>
    <Button title="Se connecter ou créer un compte" onPress={() => requestSignIn('Connecte-toi pour accéder aux paramètres de ton profil.')} />
  </Screen>;
  return <Screen><Heading>Mon compte</Heading><Text>{session.user.email}</Text>
    <Field label="Nom affiché" value={name} onChangeText={setName} maxLength={80} />
    <Message text={message} /><Button title="Enregistrer le profil" disabled={busy} onPress={() => void save()} />
    <Button title="Se déconnecter de cet appareil" disabled={busy} onPress={() => void logout()} />
    {!confirmDelete ? <Button title="Supprimer mon compte" disabled={busy}
      style={{ backgroundColor: '#9c2f2f' }} onPress={() => { setConfirmDelete(true); setMessage(''); }} /> : <>
      <Heading>Supprimer définitivement mon compte</Heading>
      <Text>Ton compte, ton profil, tes recettes personnelles, tes favoris, tes repas planifiés et les photos de ton dossier seront supprimés. Cette action est irréversible.</Text>
      <Text>Si la suppression est interrompue, certaines photos peuvent déjà avoir été retirées.</Text>
      <Field label="Écris SUPPRIMER pour confirmer" value={confirmation} onChangeText={setConfirmation}
        autoCapitalize="characters" autoCorrect={false} editable={!busy} />
      <Button title={busy ? 'Suppression…' : 'Confirmer la suppression'} disabled={busy || confirmation !== 'SUPPRIMER'}
        style={{ backgroundColor: '#9c2f2f' }} onPress={() => void deleteAccount()} />
      <Button title="Annuler" disabled={busy} onPress={() => { setConfirmDelete(false); setConfirmation(''); setMessage(''); }} />
    </>}
  </Screen>;
}

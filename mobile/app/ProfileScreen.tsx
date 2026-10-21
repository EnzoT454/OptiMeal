import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { Profile } from '../types/api';
import { Button, Field, Heading, Message, Screen } from '../components/ui';

export default function ProfileScreen() {
  const { session } = useAuth();
  const [name, setName] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    api<Profile>('/api/v1/me').then(profile => { if (active) setName(profile.display_name ?? ''); })
      .catch(e => { if (active) setMessage(e.message); });
    return () => { active = false; };
  }, []));
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
  return <Screen><Heading>Mon compte</Heading><Text>{session?.user.email}</Text>
    <Field label="Nom affiché" value={name} onChangeText={setName} maxLength={80} />
    <Message text={message} /><Button title="Enregistrer le profil" disabled={busy} onPress={() => void save()} />
    <Button title="Se déconnecter de cet appareil" disabled={busy} onPress={() => void logout()} />
  </Screen>;
}

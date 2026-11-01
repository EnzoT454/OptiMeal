import { useState } from 'react';
import { Text } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { Button, Field, Heading, Message, Screen } from '../components/ui';

export default function AuthScreen({ reason, onCancel }: { reason?: string; onCancel?: () => void }) {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const auth = useAuth();
  async function submit() {
    if (busy) return;
    if (!email.trim().includes('@') || password.length < 8) {
      setMessage('Saisis une adresse courriel et un mot de passe d’au moins 8 caractères.'); return;
    }
    if (signup && password !== confirm) { setMessage('Les mots de passe ne correspondent pas.'); return; }
    setBusy(true); setMessage('');
    try {
      const result = signup
        ? await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: Linking.createURL('auth/callback') } })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) {
        const code = result.error.code;
        setMessage(code === 'invalid_credentials' ? 'Courriel ou mot de passe incorrect.' :
          code === 'email_not_confirmed' ? 'Confirme ton courriel avant de te connecter.' :
          code === 'over_email_send_rate_limit' || result.error.status === 429 ? 'Trop de tentatives. Réessaie plus tard.' :
          'Connexion impossible. Vérifie les informations et réessaie.');
      } else if (signup && !result.data.session) {
        setMessage('Consulte ton courriel pour confirmer ton compte, puis connecte-toi.');
        setSignup(false); setPassword(''); setConfirm('');
      }
    } catch { setMessage('Service inaccessible. Vérifie la connexion et réessaie.'); }
    finally { setBusy(false); }
  }
  return <Screen><Heading>OptiMeal</Heading><Text>{signup ? 'Créer un compte' : 'Retrouve tes recettes'}</Text>
    {reason && <Text>{reason}</Text>}
    <Field label="Courriel" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} autoComplete="email" />
    <Field label="Mot de passe" secureTextEntry value={password} onChangeText={setPassword} autoComplete={signup ? 'new-password' : 'current-password'} />
    {signup && <Field label="Confirmer le mot de passe" secureTextEntry value={confirm} onChangeText={setConfirm} />}
    <Message text={message || auth.error} />
    <Button title={busy ? 'Un instant…' : signup ? 'Créer mon compte' : 'Se connecter'} disabled={busy} onPress={() => void submit()} />
    <Button title={signup ? 'J’ai déjà un compte' : 'Créer un compte'} disabled={busy} onPress={() => { setSignup(!signup); setMessage(''); }} />
    {onCancel && <Button title="Continuer sans compte" disabled={busy} onPress={onCancel} />}
  </Screen>;
}

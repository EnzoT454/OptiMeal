import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { Session } from '@supabase/supabase-js';
import { clearDeletedAccountSession, supabase } from '../services/supabase';

const AuthContext = createContext<{
  session: Session | null; loading: boolean; error: string;
  signInReason: string | null; requestSignIn: (reason: string) => void; dismissSignIn: () => void;
  forgetDeletedAccount: () => Promise<void>;
}>({ session: null, loading: true, error: '', signInReason: null, requestSignIn: () => {}, dismissSignIn: () => {},
  forgetDeletedAccount: async () => {} });
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signInReason, setSignInReason] = useState<string | null>(null);
  async function forgetDeletedAccount() {
    try { await clearDeletedAccountSession(); }
    finally { setSession(null); setSignInReason(null); setError(''); }
  }
  useEffect(() => {
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, value) => {
      if (active) { setSession(value); setLoading(false); if (value) setSignInReason(null); }
    });
    supabase.auth.getSession().then(({ data, error: failure }) => {
      if (active) { setSession(data.session); setLoading(false); if (failure) setError('Session indisponible. Reconnecte-toi.'); }
    }).catch(() => { if (active) { setLoading(false); setError('Session indisponible.'); } });
    const handleUrl = async (url: string) => {
      try {
        const target = url.split(/[?#]/)[0];
        if (target !== Linking.createURL('auth/callback') && target !== 'optimeal://auth/callback') return;
        const code = new URL(url).searchParams.get('code');
        if (!code) return;
        const result = await supabase.auth.exchangeCodeForSession(code);
        if (result.error && active) setError('Lien expiré ou ouvert sur un autre appareil. Connecte-toi après confirmation.');
      } catch { if (active) setError('Lien de confirmation indisponible. Réessaie la connexion.'); }
    };
    Linking.getInitialURL().then(url => { if (url) void handleUrl(url); }).catch(() => {
      if (active) setError('Lien de confirmation indisponible.');
    });
    const links = Linking.addEventListener('url', event => { void handleUrl(event.url); });
    if (Platform.OS !== 'web') supabase.auth.startAutoRefresh();
    const appState = AppState.addEventListener('change', state => {
      if (Platform.OS !== 'web') {
        if (state === 'active') supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh();
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); links.remove(); appState.remove(); supabase.auth.stopAutoRefresh(); };
  }, []);
  return <AuthContext.Provider value={{ session, loading, error, signInReason,
    requestSignIn: setSignInReason, dismissSignIn: () => setSignInReason(null), forgetDeletedAccount }}>{children}</AuthContext.Provider>;
}

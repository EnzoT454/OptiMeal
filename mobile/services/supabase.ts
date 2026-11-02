import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key || !key.startsWith('sb_publishable_')) {
  throw new Error('Configurer l’URL Supabase et une publishable key dans mobile/.env.');
}

// Même clé que le défaut Supabase : les sessions déjà installées sont conservées.
export const authStorageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;

export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage, autoRefreshToken: true, persistSession: true,
    storageKey: authStorageKey,
    detectSessionInUrl: false, flowType: 'pkce', lock: processLock,
  },
});

// Après suppression distante uniquement : ne pas conserver une session locale
// si l'appel de déconnexion échoue parce que le compte n'existe plus ou que le réseau tombe.
export async function clearDeletedAccountSession(): Promise<void> {
  await supabase.auth.stopAutoRefresh();
  try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* Nettoyage local ci-dessous. */ }
  await AsyncStorage.multiRemove([authStorageKey, `${authStorageKey}-code-verifier`, `${authStorageKey}-user`]);
}

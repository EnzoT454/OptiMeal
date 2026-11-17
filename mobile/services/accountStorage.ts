import AsyncStorage from '@react-native-async-storage/async-storage';

export type LocalAccount = string | null;

// Aucun repli vers les anciennes clés communes : leur propriétaire est inconnu.
function accountKey(userId: LocalAccount, name: string): string {
  if (userId && deletedAccounts.has(userId)) throw new Error('Ce compte a été supprimé de cet appareil.');
  if (!userId?.trim()) throw new Error('Connecte-toi pour enregistrer tes données personnelles.');
  return `optimeal.accounts.v1.${encodeURIComponent(userId)}.${name}`;
}

// Les modifications d'une même clé sont ordonnées, même depuis deux écrans.
const deletedAccounts = new Set<string>();
const pending = new Map<string, Promise<void>>();
function change<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const result = (pending.get(key) ?? Promise.resolve()).then(operation);
  const settled = result.then(() => {}, () => {});
  pending.set(key, settled);
  void settled.then(() => { if (pending.get(key) === settled) pending.delete(key); });
  return result;
}

async function read<T>(key: string, fallback: T): Promise<T> {
  const text = await AsyncStorage.getItem(key);
  return text === null ? fallback : JSON.parse(text) as T;
}

export async function readAccountJSON<T>(userId: LocalAccount, name: string, fallback: T): Promise<T> {
  if (!userId) return fallback;
  const key = accountKey(userId, name);
  await pending.get(key);
  return read(key, fallback);
}

export async function writeAccountJSON<T>(userId: LocalAccount, name: string, value: T): Promise<void> {
  const key = accountKey(userId, name); // compte capturé avant toute attente
  return change(key, () => AsyncStorage.setItem(key, JSON.stringify(value)));
}

export async function updateAccountJSON<T>(
  userId: LocalAccount, name: string, fallback: T, update: (value: T) => T,
): Promise<T> {
  const key = accountKey(userId, name);
  return change(key, async () => {
    const next = update(await read(key, fallback));
    await AsyncStorage.setItem(key, JSON.stringify(next));
    return next;
  });
}

// Called only after confirmed remote deletion. Block late writes before waiting
// for already queued storage operations, then remove this account's namespace.
export async function purgeAccountStorage(userId: string): Promise<void> {
  deletedAccounts.add(userId);
  const prefix = `optimeal.accounts.v1.${encodeURIComponent(userId)}.`;
  await Promise.all([...pending].filter(([key]) => key.startsWith(prefix)).map(([, work]) => work));
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(prefix));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}

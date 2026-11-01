import { supabase } from './supabase';

const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true, timeoutMs = 15000): Promise<T> {
  if (!baseUrl) throw new Error('Configurer l’adresse du serveur dans mobile/.env.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('Session indisponible. Reconnecte-toi.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(baseUrl + path, {
      ...options, signal: controller.signal,
      headers: { 'Content-Type': 'application/json',
        ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        ...options.headers },
    });
  } catch {
    throw new Error('Serveur inaccessible. Vérifie la connexion et réessaie.');
  } finally { clearTimeout(timer); }
  if (response.status === 401 && data.session && retry) {
    const refreshed = await supabase.auth.refreshSession();
    if (!refreshed.error && refreshed.data.session) return api<T>(path, options, false, timeoutMs);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(response.status, response.status === 503 ? 'Service temporairement indisponible. Réessaie.' : payload?.error?.message ??
      (response.status === 401 ? 'Session expirée. Reconnecte-toi.' :
        response.status === 422 ? 'Vérifie les champs du formulaire.' : 'Opération impossible. Réessaie.'));
  }
  return response.status === 204 ? undefined as T : response.json();
}

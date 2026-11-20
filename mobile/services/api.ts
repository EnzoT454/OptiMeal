import { supabase } from './supabase';

const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string,
    public context?: { list_id?: string | null; current_revision?: number | null; expected_revision?: number | null }) { super(message); }
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true, timeoutMs = 15000, expectedUserId?: string): Promise<T> {
  if (!baseUrl) throw new Error('Configurer l’adresse du serveur dans mobile/.env.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('Session indisponible. Reconnecte-toi.');
  if (expectedUserId && data.session?.user.id !== expectedUserId) throw new Error('Le compte a changé. Rouvre ta liste.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort);
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
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
  if (response.status === 401 && data.session && retry) {
    const refreshed = await supabase.auth.refreshSession();
    if (!refreshed.error && refreshed.data.session) return api<T>(path, options, false, timeoutMs, expectedUserId);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(response.status, response.status === 503 ? 'Service temporairement indisponible. Réessaie.' : payload?.error?.message ??
      (response.status === 401 ? 'Session expirée. Reconnecte-toi.' :
        response.status === 422 ? 'Vérifie les champs du formulaire.' : 'Opération impossible. Réessaie.'),
      payload?.error?.code, payload?.error);
  }
  return response.status === 204 ? undefined as T : response.json();
}

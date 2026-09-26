/**
 * Session-scoped store for a "bring your own key" OpenRouter access key.
 *
 * The key is a short-lived secret handed to someone for a demo, so it lives in
 * `sessionStorage` only: it survives a reload of the same tab and disappears when the
 * browser session ends. It is deliberately never written to `localStorage`, IndexedDB,
 * cookies, URLs, or any persisted project/history state, and never logged.
 */
const SESSION_KEY = "openrouter_session_key";

const isBrowser = typeof window !== "undefined";

type Listener = () => void;
const listeners = new Set<Listener>();

export function onSessionKeyChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

export function getSessionKey(): string | null {
  if (!isBrowser) return null;
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    // Storage can be unavailable (private mode, blocked site data) — treat as no key.
    return null;
  }
}

export function setSessionKey(key: string): void {
  if (!isBrowser) return;
  try {
    sessionStorage.setItem(SESSION_KEY, key);
  } catch {
    // Storage can be blocked (private mode, blocked site data). The write is simply lost,
    // so the next read finds no key and the entry screen stays up.
  }
  notifyListeners();
}

export function clearSessionKey(): void {
  if (!isBrowser) return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
  notifyListeners();
}

/**
 * Cheap shape check so obvious typos are caught before a network round trip.
 * Deliberately lenient — OpenRouter is the authority on whether a key is valid.
 */
export function looksLikeOpenRouterKey(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("sk-or-") && trimmed.length >= 20 && !/\s/.test(trimmed);
}

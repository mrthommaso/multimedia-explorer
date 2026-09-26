/**
 * Boundary for the caller-supplied OpenRouter key on its way from the browser to this
 * app's own API routes.
 *
 * The browser is not authenticating to OpenRouter directly — it hands its key to one of
 * our routes, which then authenticates to OpenRouter with it for that single request.
 * A dedicated internal header keeps that distinction explicit and keeps the secret out
 * of request bodies, URLs, and cookies.
 */
export const OPENROUTER_KEY_HEADER = "x-openrouter-key";

/** Headers a browser request to our own API routes needs in order to authorize upstream calls. */
export function openRouterKeyHeaders(apiKey: string): Record<string, string> {
  return { [OPENROUTER_KEY_HEADER]: apiKey };
}

/**
 * Read the caller-supplied key inside an API route. The internal header wins;
 * `Authorization: Bearer` stays supported so upstream's calling convention keeps working.
 *
 * The returned key is used for the current request only — never stored, logged, cached,
 * or written to a cookie.
 */
export function readOpenRouterKey(request: { headers: Headers }): string | null {
  const internal = request.headers.get(OPENROUTER_KEY_HEADER)?.trim();
  if (internal) return internal;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }

  return null;
}

import type { ApiErrorBody } from '@steerarr/shared';
import { session } from './auth.svelte';

/** A failed call to the Steerarr API. `code` is an ApiErrorCode or one of the client-side codes. */
export class ApiError extends Error {
  override name = 'ApiError';
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const AUTH_RELOAD_KEY = 'steerarr:auth-reload-at';

/**
 * Calls the Steerarr API. `path` is relative to /api, e.g. 'sonarr/system/status'.
 * URLs resolve against the page, so the app works under any path behind a reverse proxy.
 */
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const url = new URL(`api/${path.replace(/^\/+/, '')}`, document.baseURI);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
      // A login proxy (e.g. authentik) answers with a redirect to its login page when its session has expired.
      redirect: 'manual',
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'network', "Can't reach Steerarr. Check your connection.");
  }

  if (looksLikeLoginRedirect(response)) {
    reloadForLogin();
    throw new ApiError(401, 'auth_expired', 'Your login has expired. Reloading to sign in again.');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    // Steerarr's own login: App swaps in the login form.
    if (body?.error?.code === 'login_required') session.loginRequired = true;
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'http_error',
      body?.error?.message ?? noBodyMessage(response.status),
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * A login page of a proxy in front of Steerarr: the backend never sends redirects or HTML from
 * /api, and its own 401s (Steerarr's login) always carry a JSON body.
 */
function looksLikeLoginRedirect(response: Response): boolean {
  if (response.type === 'opaqueredirect') return true;
  const type = response.headers.get('content-type') ?? '';
  if (response.status === 401) return !type.includes('application/json');
  // A proxy's own error page (e.g. when it gave up waiting) is HTML too, but no login.
  if (response.status >= 500) return false;
  return type.includes('text/html');
}

/** An error without Steerarr's JSON body came from something in between, e.g. a proxy. */
function noBodyMessage(status: number): string {
  if (status === 502 || status === 504) {
    return `No answer in time (HTTP ${status}). A proxy may have given up waiting. Try again.`;
  }
  return `Steerarr returned HTTP ${status}`;
}

/** Reloads once so the proxy can show its login page. Gives up if we just did that. */
function reloadForLogin(): void {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(AUTH_RELOAD_KEY)) || 0;
  } catch {
    // Storage can be unavailable (private mode); reload anyway.
  }
  if (Date.now() - last < 30_000) return;
  try {
    sessionStorage.setItem(AUTH_RELOAD_KEY, String(Date.now()));
  } catch {
    // Ignore.
  }
  location.reload();
}

/** The message to show for any error thrown by `api`. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

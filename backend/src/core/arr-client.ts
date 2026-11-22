import { UpstreamError, type Credentials } from './upstream-error.js';

export interface ArrClientOptions {
  /** Display name used in error messages, e.g. "Sonarr". */
  serviceName: string;
  /** Base URL of the service, including any URL base, e.g. http://10.0.0.5:8989/sonarr */
  baseUrl: string;
  /** The *arr apps' key, sent as X-Api-Key. Give this or `login`. */
  apiKey?: string;
  /** A username and password, sent as HTTP Basic auth (e.g. NZBGet). */
  login?: { username: string; password: string };
  /** API path appended to the base URL, e.g. /api/v3 */
  apiPath: string;
  /** Per-request timeout. Default 15 s. */
  timeoutMs?: number;
}

/** Query values; a list repeats the key once per item (e.g. indexerIds=1&indexerIds=2). */
export type Query = Record<
  string,
  string | number | boolean | readonly (string | number)[] | undefined
>;

interface RequestOptions {
  query?: Query;
  body?: unknown;
  timeoutMs?: number;
}

/** A file fetched from the service, e.g. a poster image. */
export interface ArrFile {
  data: Buffer;
  contentType: string;
}

/**
 * Minimal JSON client for the *arr family (Sonarr, Radarr, Lidarr, Prowlarr all share the
 * same conventions: X-Api-Key header, JSON bodies). Throws UpstreamError on any failure.
 * The API key is only ever sent as a header, so it never appears in URLs or error messages.
 */
export class ArrClient {
  readonly #serviceName: string;
  /** The service's base URL without a trailing slash, e.g. http://host:8989/sonarr */
  readonly #base: string;
  readonly #apiPath: string;
  /** The header that carries the credentials, and its value. */
  readonly #authHeader: [string, string];
  readonly #credentials: Credentials;
  readonly #timeoutMs: number;

  constructor(options: ArrClientOptions) {
    const base = new URL(options.baseUrl);
    base.search = '';
    base.hash = '';
    this.#base = base.toString().replace(/\/+$/, '');
    this.#apiPath = options.apiPath;
    this.#serviceName = options.serviceName;
    if (options.login) {
      const { username, password } = options.login;
      const token = Buffer.from(`${username}:${password}`).toString('base64');
      this.#authHeader = ['Authorization', `Basic ${token}`];
      this.#credentials = 'login';
    } else {
      this.#authHeader = ['X-Api-Key', options.apiKey ?? ''];
      this.#credentials = 'apiKey';
    }
    this.#timeoutMs = options.timeoutMs ?? 15_000;
  }

  /** Builds the full URL for an API path, e.g. url('/series', { id: 1 }). */
  url(path: string, query: Query = {}): URL {
    const url = new URL(this.#base + this.#apiPath + withSlash(path));
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      if (Array.isArray(value))
        for (const item of value) url.searchParams.append(key, String(item));
      else url.searchParams.set(key, String(value));
    }
    return url;
  }

  get<T>(path: string, query?: Query, options?: { timeoutMs?: number }): Promise<T> {
    return this.request<T>('GET', path, { query, ...options });
  }

  post<T>(path: string, body?: unknown, query?: Query): Promise<T> {
    return this.request<T>('POST', path, { body, query });
  }

  put<T>(path: string, body?: unknown, query?: Query): Promise<T> {
    return this.request<T>('PUT', path, { body, query });
  }

  delete<T = void>(path: string, query?: Query): Promise<T> {
    return this.request<T>('DELETE', path, { query });
  }

  /**
   * Fetches a binary file from the API, e.g. '/mediacover/12/poster-250.jpg'. Use the API's
   * routes rather than the web UI's (/MediaCover/...): those need a login and ignore the key.
   */
  async getFile(path: string, options: { timeoutMs?: number } = {}): Promise<ArrFile> {
    const { response, data } = await this.#send(
      'GET',
      this.url(path),
      { Accept: '*/*' },
      undefined,
      options.timeoutMs,
    );
    if (!response.ok) {
      throw new UpstreamError(`${this.#serviceName} returned HTTP ${response.status}`, {
        service: this.#serviceName,
        kind: 'http',
        status: response.status,
        credentials: this.#credentials,
      });
    }
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    return { data, contentType };
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const service = this.#serviceName;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    const { response, data } = await this.#send(
      method,
      this.url(path, options.query),
      headers,
      options.body === undefined ? undefined : JSON.stringify(options.body),
      options.timeoutMs,
    );
    const text = data.toString('utf8');
    const body = parseJson(text);

    if (!response.ok) {
      throw new UpstreamError(`${service} returned HTTP ${response.status}`, {
        service,
        kind: 'http',
        status: response.status,
        body: body.ok ? body.value : undefined,
        credentials: this.#credentials,
      });
    }
    if (text === '') return undefined as T;
    if (!body.ok) {
      throw new UpstreamError(`${service} returned a response that isn't JSON`, {
        service,
        kind: 'http',
        status: response.status,
      });
    }
    return body.value as T;
  }

  /** Sends a request with the credentials and reads the whole body, mapping failures. */
  async #send(
    method: string,
    url: URL,
    headers: Record<string, string>,
    body: string | undefined,
    timeoutMs = this.#timeoutMs,
  ): Promise<{ response: Response; data: Buffer }> {
    const service = this.#serviceName;
    try {
      const response = await fetch(url, {
        method,
        headers: { ...headers, [this.#authHeader[0]]: this.#authHeader[1] },
        body,
        // A redirect means the URL points at a login page or the wrong place; don't follow it.
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Reading the body is covered by the same timeout and can fail the same ways.
      const data = Buffer.from(await response.arrayBuffer());
      return { response, data };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        throw new UpstreamError(`${service} didn't respond within ${timeoutMs / 1000} s`, {
          service,
          kind: 'timeout',
        });
      }
      throw new UpstreamError(`Can't reach ${service}: ${describeNetworkError(err)}`, {
        service,
        kind: 'network',
      });
    }
  }
}

function withSlash(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  if (text === '') return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

const NETWORK_ERRORS: Record<string, string> = {
  ENOTFOUND: "the host name can't be found",
  EAI_AGAIN: "the host name can't be looked up right now",
  ECONNREFUSED: 'the connection was refused',
  ECONNRESET: 'the connection was dropped',
  UND_ERR_SOCKET: 'the connection was dropped',
  ERR_HTTP2_STREAM_ERROR: 'the server reset the connection',
  EHOSTUNREACH: "the host isn't reachable",
  ENETUNREACH: "the network isn't reachable",
  ETIMEDOUT: 'the connection timed out',
  DEPTH_ZERO_SELF_SIGNED_CERT: "its HTTPS certificate isn't trusted",
  SELF_SIGNED_CERT_IN_CHAIN: "its HTTPS certificate isn't trusted",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "its HTTPS certificate isn't trusted",
  CERT_HAS_EXPIRED: 'its HTTPS certificate has expired',
};

/**
 * Node's fetch reports "fetch failed" and hides the useful part (ECONNREFUSED etc.) in `cause`.
 * Returns e.g. "the connection was refused (ECONNREFUSED)".
 */
function describeNetworkError(err: unknown): string {
  const cause = (err as { cause?: { code?: string; message?: string } } | undefined)?.cause;
  const code = cause?.code;
  if (code) return NETWORK_ERRORS[code] ? `${NETWORK_ERRORS[code]} (${code})` : code;
  return cause?.message ?? (err instanceof Error ? err.message : String(err));
}

/**
 * A call to an upstream service (Sonarr, Radarr, ...) failed.
 * - network: no response (wrong URL, service down, DNS, connection refused)
 * - timeout: no response within the client's timeout
 * - http:    the service answered with a non-2xx status or a body that isn't JSON
 */
export type UpstreamErrorKind = 'network' | 'timeout' | 'http';

export class UpstreamError extends Error {
  override name = 'UpstreamError';
  /** Display name of the service, e.g. "Sonarr". */
  readonly service: string;
  readonly kind: UpstreamErrorKind;
  /** HTTP status from the service, when it answered. */
  readonly status: number | undefined;
  /** Parsed response body from the service, when there was one. */
  readonly body: unknown;
  /** How Steerarr logged in, so a rejection can say what to check. */
  readonly credentials: Credentials;

  constructor(message: string, details: UpstreamErrorDetails) {
    super(message);
    this.service = details.service;
    this.kind = details.kind;
    this.status = details.status;
    this.body = details.body;
    this.credentials = details.credentials ?? 'apiKey';
  }
}

/** An API key (the *arr apps), or a username and password (e.g. NZBGet). */
export type Credentials = 'apiKey' | 'login';

interface UpstreamErrorDetails {
  service: string;
  kind: UpstreamErrorKind;
  status?: number;
  body?: unknown;
  credentials?: Credentials;
}

/** Error codes the Steerarr API can return. */
export type ApiErrorCode =
  | 'bad_request'
  | 'not_found'
  | 'internal'
  /** The service hasn't been set up in Steerarr's settings yet. */
  | 'not_configured'
  /** The service didn't answer (wrong address, service down, network). */
  | 'upstream_unreachable'
  /** The service took too long to answer. */
  | 'upstream_timeout'
  /** The service rejected Steerarr's API key. */
  | 'upstream_auth'
  /** The service answered with a server error or an unusable response. */
  | 'upstream_error'
  /** Steerarr's login is on and this device isn't logged in (or its login expired). */
  | 'login_required'
  /** Wrong username or password. */
  | 'login_failed'
  /** Too many failed logins from this address; wait and try again. */
  | 'too_many_attempts'
  /** The login settings file can't be read, so nobody can log in until it's fixed. */
  | 'login_unavailable';

/** Body of every error response from the Steerarr API. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

/** GET /healthz */
export interface HealthzResponse {
  status: 'ok';
}

/** A service module the server knows about. */
export interface ServiceInfo {
  /** Matches the module id on both sides and the URL prefix: /api/<id>. */
  id: string;
  name: string;
  /** Whether its address and API key have been saved in Steerarr's settings. */
  configured: boolean;
  /** The saved address, when it's set up. */
  url: string | null;
}

/** GET /api/<id>/summary: what a service's card on the Home screen shows. */
export interface ServiceSummary {
  version: string;
  /** Short facts, e.g. "2 in the queue", "12 missing episodes". */
  facts: string[];
  /** The service's own health warnings and errors. */
  issues: Array<{ level: 'warning' | 'error'; message: string }>;
}

/** A page of a longer list, e.g. a service's history. */
export interface Page<T> {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: T[];
}

/** Body of PUT /api/<sonarr|radarr>/add-defaults: the profile the add form starts with. */
export interface AddDefaultsRequest {
  /** null for no default (the form starts with what was used last on the device). */
  qualityProfileId: number | null;
}

/** GET /api/about */
export interface AboutResponse {
  /** The commit the running Steerarr was built from, or null for a development build. */
  commit: string | null;
}

/** GET /api/services */
export interface ServicesResponse {
  services: ServiceInfo[];
}

/** GET /api/<id>/settings. The API key itself is never sent to the app. */
export interface ArrSettings {
  url: string | null;
  /** Whether the secret is saved: the API key, or the password for username/password services. */
  apiKeySaved: boolean;
  /** The saved username, for services that log in with one (e.g. NZBGet). */
  username: string | null;
}

/**
 * POST /api/<id>/settings/test. Leave `apiKey` out to use the saved key, which only works while
 * the address is unchanged. Services that log in with a username and password send the
 * password as `apiKey`.
 */
export interface ArrSettingsTestRequest {
  url: string;
  apiKey?: string;
  /** Needed by services that log in with a username and password. */
  username?: string;
}

/** PUT /api/<id>/settings. Tests the connection first unless `force` is true. */
export interface ArrSettingsSaveRequest extends ArrSettingsTestRequest {
  force?: boolean;
}

/** Status of an *arr service, e.g. GET /api/sonarr/system/status. */
export interface ArrStatus {
  appName: string;
  instanceName: string;
  version: string;
  branch: string;
  /** ISO 8601 timestamp of when the service started. */
  startTime: string;
}

/** GET /api/auth/status. Always reachable, logged in or not. */
export interface AuthStatus {
  /** Whether Steerarr asks for a login. Off until it's turned on in Steerarr's settings. */
  enabled: boolean;
  /** Whether this device is logged in. Always false while the login is off. */
  loggedIn: boolean;
  /** The login's username, only shown to a device that's logged in. */
  username: string | null;
}

/** POST /api/auth/login */
export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * PUT /api/auth/settings: turn the login on or off, or change the username or password.
 * While the login is on, every change needs `currentPassword`.
 */
export interface AuthSettingsRequest {
  enabled: boolean;
  /** Needed to turn the login on, and when it stays on. */
  username?: string;
  /** Needed to turn the login on. Leave it out to keep the current password. */
  newPassword?: string;
  currentPassword?: string;
}

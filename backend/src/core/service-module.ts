import type { FastifyInstance } from 'fastify';
import type { ArrServiceConfig } from './settings-store.js';
import type { Credentials } from './upstream-error.js';

/** GET /api/v3/system/status (or /api/v1 for Prowlarr): the fields Steerarr uses. */
export interface SystemStatusResource {
  appName: string;
  instanceName: string;
  version: string;
  branch: string;
  startTime: string;
}

/** What every *arr client offers. Used to test a connection before saving settings. */
export interface ArrServiceClient {
  getSystemStatus(): Promise<SystemStatusResource>;
}

/** Registers a service's own routes. Runs in its own Fastify scope with the prefix /api/<id>. */
export type ServiceRoutes = (app: FastifyInstance) => Promise<void>;

/** A service's saved preferences, for its routes to read and change. */
export interface ServicePreferences {
  /** The quality profile the add form starts with, or null for none chosen. */
  defaultQualityProfileId(): number | null;
  setDefaultQualityProfileId(profileId: number | null): Promise<void>;
}

/**
 * One service (Sonarr, Radarr, ...). It's set up from the app: the core mounts its settings
 * routes, saves its address and API key, and hands its routes a client built from them.
 * To add a service: create src/services/<id>/ with an index.ts exporting a ServiceModule,
 * then add it to src/services/index.ts.
 */
export interface ServiceModule<Client extends ArrServiceClient = ArrServiceClient> {
  /** Lowercase id: the URL prefix (/api/<id>) and the frontend module's id. */
  id: string;
  /** Display name, e.g. "Sonarr". */
  name: string;
  /**
   * How Steerarr logs in: an API key (the *arr apps, the default), or a username and password
   * ('login', e.g. NZBGet). For 'login' the password is kept where the API key would be.
   */
  credentials?: Credentials;
  /** Builds a client for the given settings. */
  createClient(config: ArrServiceConfig): Client;
  /**
   * The service's own routes. Call `getClient()` inside each handler: it returns the client for
   * the current settings, or throws NotConfiguredError (answered as 503). Don't use /settings,
   * which the core owns.
   */
  routes(getClient: () => Client, preferences: ServicePreferences): ServiceRoutes;
}

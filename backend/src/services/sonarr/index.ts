import type { ServiceModule } from '../../core/service-module.js';
import { SonarrClient } from './client.js';
import { sonarrRoutes } from './routes.js';

/** Sonarr. Set up from the app's settings screen. */
export const sonarr: ServiceModule<SonarrClient> = {
  id: 'sonarr',
  name: 'Sonarr',
  createClient: (config) => new SonarrClient(config),
  routes: sonarrRoutes,
};

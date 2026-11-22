import type { ServiceModule } from '../../core/service-module.js';
import { RadarrClient } from './client.js';
import { radarrRoutes } from './routes.js';

/** Radarr. Set up from the app's settings screen. */
export const radarr: ServiceModule<RadarrClient> = {
  id: 'radarr',
  name: 'Radarr',
  createClient: (config) => new RadarrClient(config),
  routes: radarrRoutes,
};

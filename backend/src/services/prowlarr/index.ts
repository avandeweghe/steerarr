import type { ServiceModule } from '../../core/service-module.js';
import { ProwlarrClient } from './client.js';
import { prowlarrRoutes } from './routes.js';

/** Prowlarr: searching every indexer at once and grabbing a result. */
export const prowlarr: ServiceModule<ProwlarrClient> = {
  id: 'prowlarr',
  name: 'Prowlarr',
  createClient: (config) => new ProwlarrClient(config),
  routes: prowlarrRoutes,
};

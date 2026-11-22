import type { ServiceModule } from '../../core/service-module.js';
import { NzbgetClient } from './client.js';
import { nzbgetRoutes } from './routes.js';

/** NZBGet, the Usenet download client: its queue (with controls) and history. */
export const nzbget: ServiceModule<NzbgetClient> = {
  id: 'nzbget',
  name: 'NZBGet',
  credentials: 'login',
  createClient: (config) => new NzbgetClient(config),
  routes: nzbgetRoutes,
};

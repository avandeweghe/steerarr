import type { FrontendService } from '../../lib/service';
import Downloads from './pages/Downloads.svelte';

/** A tray with an arrow into it. */
const downloadIcon =
  'M12 4v10m-4-4 4 4 4-4M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15';

export const nzbget: FrontendService = {
  id: 'nzbget',
  name: 'NZBGet',
  icon: downloadIcon,
  credentials: 'login',
  credentialsHint: 'In NZBGet: Settings, Security, ControlUsername and ControlPassword.',
  routes: [{ path: '/nzbget', component: Downloads }],
};

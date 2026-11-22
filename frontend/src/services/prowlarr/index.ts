import type { FrontendService } from '../../lib/service';
import Indexers from './pages/Indexers.svelte';
import Search from './pages/Search.svelte';
import Status from './pages/Status.svelte';

/** A magnifying glass over a list of results. */
const searchIcon =
  'M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13ZM15.5 15.5 20 20M7.5 9h6M7.5 12h4';

export const prowlarr: FrontendService = {
  id: 'prowlarr',
  name: 'Prowlarr',
  icon: searchIcon,
  credentialsHint: 'In Prowlarr: Settings, General, API Key.',
  statusPath: '/prowlarr/status',
  routes: [
    { path: '/prowlarr', component: Search },
    { path: '/prowlarr/indexers', component: Indexers },
    { path: '/prowlarr/status', component: Status },
  ],
};

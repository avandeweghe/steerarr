import type { FrontendService } from '../../lib/service';
import Activity from './pages/Activity.svelte';
import AddSeries from './pages/AddSeries.svelte';
import AddSeriesForm from './pages/AddSeriesForm.svelte';
import Calendar from './pages/Calendar.svelte';
import Releases from './pages/Releases.svelte';
import SeriesDetail from './pages/SeriesDetail.svelte';
import SeriesList from './pages/SeriesList.svelte';
import Status from './pages/Status.svelte';
import Wanted from './pages/Wanted.svelte';

/** A TV screen with an antenna. */
const tvIcon =
  'M4 7h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1ZM8 3l4 4 4-4';

export const sonarr: FrontendService = {
  id: 'sonarr',
  name: 'Sonarr',
  icon: tvIcon,
  credentialsHint: 'In Sonarr: Settings, General, API Key.',
  statusPath: '/sonarr/status',
  adds: 'series',
  routes: [
    { path: '/sonarr', component: SeriesList },
    { path: '/sonarr/series/:id', component: SeriesDetail },
    { path: '/sonarr/series/:id/releases/season/:season', component: Releases },
    { path: '/sonarr/series/:id/releases/episode/:episodeId', component: Releases },
    { path: '/sonarr/add', component: AddSeries },
    { path: '/sonarr/add/:tvdbId', component: AddSeriesForm },
    { path: '/sonarr/calendar', component: Calendar },
    { path: '/sonarr/activity', component: Activity },
    { path: '/sonarr/wanted', component: Wanted },
    { path: '/sonarr/status', component: Status },
  ],
};

import type { FrontendService } from '../../lib/service';
import Activity from './pages/Activity.svelte';
import AddMovie from './pages/AddMovie.svelte';
import AddMovieForm from './pages/AddMovieForm.svelte';
import Calendar from './pages/Calendar.svelte';
import MovieDetail from './pages/MovieDetail.svelte';
import MovieList from './pages/MovieList.svelte';
import Releases from './pages/Releases.svelte';
import Status from './pages/Status.svelte';
import Wanted from './pages/Wanted.svelte';

/** A film frame with sprocket holes. */
const filmIcon =
  'M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM8 3v18M16 3v18M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4';

export const radarr: FrontendService = {
  id: 'radarr',
  name: 'Radarr',
  icon: filmIcon,
  credentialsHint: 'In Radarr: Settings, General, API Key.',
  statusPath: '/radarr/status',
  adds: 'movie',
  routes: [
    { path: '/radarr', component: MovieList },
    { path: '/radarr/movies/:id', component: MovieDetail },
    { path: '/radarr/movies/:id/releases', component: Releases },
    { path: '/radarr/add', component: AddMovie },
    { path: '/radarr/add/:tmdbId', component: AddMovieForm },
    { path: '/radarr/calendar', component: Calendar },
    { path: '/radarr/activity', component: Activity },
    { path: '/radarr/wanted', component: Wanted },
    { path: '/radarr/status', component: Status },
  ],
};

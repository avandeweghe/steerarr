import type {
  RadarrAddOptions,
  RadarrAddRequest,
  RadarrAddResponse,
  RadarrCalendarEntry,
  RadarrCommand,
  RadarrGrabRequest,
  RadarrHistoryItem,
  RadarrLookupResult,
  RadarrMonitorRequest,
  RadarrMovie,
  RadarrMovieDetail,
  RadarrPage,
  RadarrQueueItem,
  RadarrRelease,
  RadarrStatusPage,
  RadarrWantedMovie,
} from '@steerarr/shared';
import { api } from '../../lib/api';

/** Every movie, or only the monitored ones (a library can hold thousands). */
export function getMovies(monitoredOnly = false, signal?: AbortSignal): Promise<RadarrMovie[]> {
  return api<RadarrMovie[]>(`radarr/movies?monitored=${monitoredOnly}`, { signal });
}

export function getMovieDetail(id: number, signal?: AbortSignal): Promise<RadarrMovieDetail> {
  return api<RadarrMovieDetail>(`radarr/movies/${id}`, { signal });
}

/** Removes the movie from Radarr; deleteFiles also deletes its folder from disk. */
export function deleteMovie(id: number, deleteFiles: boolean, exclude: boolean): Promise<void> {
  return api<void>(`radarr/movies/${id}?deleteFiles=${deleteFiles}&exclude=${exclude}`, {
    method: 'DELETE',
  });
}

export function setMovieMonitored(id: number, monitored: boolean): Promise<void> {
  const body: RadarrMonitorRequest = { monitored };
  return api<void>(`radarr/movies/${id}/monitored`, { method: 'PUT', body });
}

export function searchMovie(id: number): Promise<RadarrCommand> {
  return api<RadarrCommand>(`radarr/movies/${id}/search`, { method: 'POST' });
}

export function getCommand(id: number): Promise<RadarrCommand> {
  return api<RadarrCommand>(`radarr/commands/${id}`);
}

/** Searches the indexers without grabbing anything. Can take a minute. */
export function getMovieReleases(id: number, signal?: AbortSignal): Promise<RadarrRelease[]> {
  return api<RadarrRelease[]>(`radarr/movies/${id}/releases`, { signal });
}

/** Sends a release from a recent search to the download client. */
export function grabRelease(release: RadarrGrabRequest): Promise<void> {
  const body: RadarrGrabRequest = { guid: release.guid, indexerId: release.indexerId };
  return api<void>('radarr/releases', { method: 'POST', body });
}

/** Deletes the movie's file from disk. The movie stays monitored. */
export function deleteMovieFile(id: number): Promise<void> {
  return api<void>(`radarr/movies/${id}/file`, { method: 'DELETE' });
}

/** Searches TMDb through Radarr, e.g. 'the matrix' or 'tmdb:603'. */
export function lookupMovies(term: string, signal?: AbortSignal): Promise<RadarrLookupResult[]> {
  return api<RadarrLookupResult[]>(`radarr/lookup?term=${encodeURIComponent(term)}`, { signal });
}

export function getAddOptions(): Promise<RadarrAddOptions> {
  return api<RadarrAddOptions>('radarr/add-options');
}

export function addMovie(request: RadarrAddRequest): Promise<RadarrAddResponse> {
  return api<RadarrAddResponse>('radarr/movies', { method: 'POST', body: request });
}

export function getQueue(signal?: AbortSignal): Promise<RadarrQueueItem[]> {
  return api<RadarrQueueItem[]>('radarr/queue', { signal });
}

/** Removes a download from Radarr's queue and the download client. */
export function removeFromQueue(id: number, blocklist: boolean): Promise<void> {
  return api<void>(`radarr/queue/${id}?blocklist=${blocklist}`, { method: 'DELETE' });
}

export function getHistory(page: number): Promise<RadarrPage<RadarrHistoryItem>> {
  return api<RadarrPage<RadarrHistoryItem>>(`radarr/history?page=${page}`);
}

export type WantedList = 'missing' | 'cutoff';

export function getWanted(list: WantedList, page: number): Promise<RadarrPage<RadarrWantedMovie>> {
  return api<RadarrPage<RadarrWantedMovie>>(`radarr/wanted/${list}?page=${page}`);
}

/** Searches every monitored movie on the list. */
export function searchWanted(list: WantedList): Promise<RadarrCommand> {
  return api<RadarrCommand>(`radarr/wanted/${list}/search`, { method: 'POST' });
}

/** Monitored movies' release dates from `start` up to `end`, by date. */
export function getCalendar(
  start: Date,
  end: Date,
  signal?: AbortSignal,
): Promise<RadarrCalendarEntry[]> {
  const range = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
  return api<RadarrCalendarEntry[]>(`radarr/calendar?${range}`, { signal });
}

/** Radarr's health checks, disk space per root folder and uptime. */
export function getStatusPage(signal?: AbortSignal): Promise<RadarrStatusPage> {
  return api<RadarrStatusPage>('radarr/status', { signal });
}

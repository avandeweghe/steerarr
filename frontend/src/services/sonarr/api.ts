import type {
  SonarrAddOptions,
  SonarrAddRequest,
  SonarrAddResponse,
  SonarrCalendarEpisode,
  SonarrCommand,
  SonarrGrabRequest,
  SonarrHistoryItem,
  SonarrLookupResult,
  SonarrMonitorRequest,
  SonarrPage,
  SonarrQueueItem,
  SonarrRelease,
  SonarrSeries,
  SonarrSeriesDetail,
  SonarrStatus,
  SonarrStatusPage,
  SonarrWantedEpisode,
} from '@steerarr/shared';
import { api } from '../../lib/api';

export function getSonarrStatus(signal?: AbortSignal): Promise<SonarrStatus> {
  return api<SonarrStatus>('sonarr/system/status', { signal });
}

/** Sonarr's health checks, disk space per root folder and uptime. */
export function getStatusPage(signal?: AbortSignal): Promise<SonarrStatusPage> {
  return api<SonarrStatusPage>('sonarr/status', { signal });
}

/** Every series, or only the monitored ones. */
export function getSeries(monitoredOnly = false, signal?: AbortSignal): Promise<SonarrSeries[]> {
  return api<SonarrSeries[]>(`sonarr/series?monitored=${monitoredOnly}`, { signal });
}

export function getSeriesDetail(id: number, signal?: AbortSignal): Promise<SonarrSeriesDetail> {
  return api<SonarrSeriesDetail>(`sonarr/series/${id}`, { signal });
}

/** Removes the series from Sonarr; deleteFiles also deletes its folder from disk. */
export function deleteSeries(id: number, deleteFiles: boolean, exclude: boolean): Promise<void> {
  return api<void>(`sonarr/series/${id}?deleteFiles=${deleteFiles}&exclude=${exclude}`, {
    method: 'DELETE',
  });
}

export function setSeriesMonitored(id: number, monitored: boolean): Promise<void> {
  return setMonitored(`sonarr/series/${id}/monitored`, monitored);
}

/** Sonarr also sets every episode in the season to match. */
export function setSeasonMonitored(id: number, season: number, monitored: boolean): Promise<void> {
  return setMonitored(`sonarr/series/${id}/seasons/${season}/monitored`, monitored);
}

export function setEpisodeMonitored(id: number, monitored: boolean): Promise<void> {
  return setMonitored(`sonarr/episodes/${id}/monitored`, monitored);
}

function setMonitored(path: string, monitored: boolean): Promise<void> {
  const body: SonarrMonitorRequest = { monitored };
  return api<void>(path, { method: 'PUT', body });
}

export function searchSeason(id: number, season: number): Promise<SonarrCommand> {
  return api<SonarrCommand>(`sonarr/series/${id}/seasons/${season}/search`, { method: 'POST' });
}

export function searchEpisode(id: number): Promise<SonarrCommand> {
  return api<SonarrCommand>(`sonarr/episodes/${id}/search`, { method: 'POST' });
}

export function getCommand(id: number): Promise<SonarrCommand> {
  return api<SonarrCommand>(`sonarr/commands/${id}`);
}

/** Searches the indexers without grabbing anything. Can take a minute. */
export function getSeasonReleases(
  id: number,
  season: number,
  signal?: AbortSignal,
): Promise<SonarrRelease[]> {
  return api<SonarrRelease[]>(`sonarr/series/${id}/seasons/${season}/releases`, { signal });
}

/** Searches the indexers without grabbing anything. Can take a minute. */
export function getEpisodeReleases(id: number, signal?: AbortSignal): Promise<SonarrRelease[]> {
  return api<SonarrRelease[]>(`sonarr/episodes/${id}/releases`, { signal });
}

/** Sends a release from a recent search to the download client. */
export function grabRelease(release: SonarrGrabRequest): Promise<void> {
  const body: SonarrGrabRequest = { guid: release.guid, indexerId: release.indexerId };
  return api<void>('sonarr/releases', { method: 'POST', body });
}

/** Searches TheTVDB through Sonarr, e.g. 'the expanse' or 'tvdb:280619'. */
export function lookupSeries(term: string, signal?: AbortSignal): Promise<SonarrLookupResult[]> {
  return api<SonarrLookupResult[]>(`sonarr/lookup?term=${encodeURIComponent(term)}`, { signal });
}

export function getAddOptions(): Promise<SonarrAddOptions> {
  return api<SonarrAddOptions>('sonarr/add-options');
}

export function addSeries(request: SonarrAddRequest): Promise<SonarrAddResponse> {
  return api<SonarrAddResponse>('sonarr/series', { method: 'POST', body: request });
}

/** Deletes the episode's file from disk. The episode stays monitored. */
export function deleteEpisodeFile(id: number): Promise<void> {
  return api<void>(`sonarr/episodes/${id}/file`, { method: 'DELETE' });
}

/** Monitored episodes airing from `start` up to `end`, by air time. */
export function getCalendar(
  start: Date,
  end: Date,
  signal?: AbortSignal,
): Promise<SonarrCalendarEpisode[]> {
  const range = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
  return api<SonarrCalendarEpisode[]>(`sonarr/calendar?${range}`, { signal });
}

export function getQueue(signal?: AbortSignal): Promise<SonarrQueueItem[]> {
  return api<SonarrQueueItem[]>('sonarr/queue', { signal });
}

/** Removes a download from Sonarr's queue and the download client. */
export function removeFromQueue(id: number, blocklist: boolean): Promise<void> {
  return api<void>(`sonarr/queue/${id}?blocklist=${blocklist}`, { method: 'DELETE' });
}

export function getHistory(page: number): Promise<SonarrPage<SonarrHistoryItem>> {
  return api<SonarrPage<SonarrHistoryItem>>(`sonarr/history?page=${page}`);
}

export type WantedList = 'missing' | 'cutoff';

export function getWanted(
  list: WantedList,
  page: number,
): Promise<SonarrPage<SonarrWantedEpisode>> {
  return api<SonarrPage<SonarrWantedEpisode>>(`sonarr/wanted/${list}?page=${page}`);
}

/** Searches every monitored episode on the list. */
export function searchWanted(list: WantedList): Promise<SonarrCommand> {
  return api<SonarrCommand>(`sonarr/wanted/${list}/search`, { method: 'POST' });
}

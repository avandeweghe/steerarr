import { ArrClient, type ArrFile } from '../../core/arr-client.js';
import type { ArrServiceClient, SystemStatusResource } from '../../core/service-module.js';
import type { ArrServiceConfig } from '../../core/settings-store.js';
import type {
  CalendarResource,
  CommandResource,
  DiskSpaceResource,
  EpisodeResource,
  HealthResource,
  HistoryResource,
  LookupResource,
  PagingResource,
  QualityProfileResource,
  QueueResource,
  QueueStatusResource,
  ReleaseResource,
  RootFolderResource,
  SeriesResource,
  WantedEpisodeResource,
} from './types.js';

/** Searching the indexers interactively can take a while with several slow indexers. */
const RELEASE_SEARCH_TIMEOUT_MS = 180_000;
/** Grabbing fetches the NZB or torrent from the indexer and hands it to the download client. */
const GRAB_TIMEOUT_MS = 60_000;
/** Looking up a series goes through Sonarr to its metadata server. */
const LOOKUP = { timeoutMs: 30_000 };

/** A search Sonarr can run as a command. */
export type SearchCommand =
  | { name: 'SeasonSearch'; seriesId: number; seasonNumber: number }
  | { name: 'EpisodeSearch'; episodeIds: number[] }
  | { name: 'MissingEpisodeSearch'; monitored: true }
  | { name: 'CutoffUnmetEpisodeSearch'; monitored: true };

/** Which wanted list: missing episodes, or episodes below their quality cutoff. */
export type WantedList = 'missing' | 'cutoff';

/** Which releases to search for interactively. */
export type ReleaseQuery = { episodeId: number } | { seriesId: number; seasonNumber: number };

/** Typed calls to the Sonarr v4 API (which is served under /api/v3). */
export class SonarrClient implements ArrServiceClient {
  readonly #api: ArrClient;

  constructor(config: ArrServiceConfig) {
    this.#api = new ArrClient({
      serviceName: 'Sonarr',
      baseUrl: config.url,
      apiKey: config.apiKey,
      apiPath: '/api/v3',
    });
  }

  getSystemStatus(): Promise<SystemStatusResource> {
    return this.#api.get<SystemStatusResource>('/system/status');
  }

  getHealth(): Promise<HealthResource[]> {
    return this.#api.get<HealthResource[]>('/health');
  }

  getQueueStatus(): Promise<QueueStatusResource> {
    return this.#api.get<QueueStatusResource>('/queue/status');
  }

  getSeries(): Promise<SeriesResource[]> {
    return this.#api.get<SeriesResource[]>('/series');
  }

  getSeriesById(id: number): Promise<SeriesResource> {
    return this.#api.get<SeriesResource>(`/series/${id}`);
  }

  /**
   * The series exactly as Sonarr sends it. Sonarr's PUT replaces the whole series, so changes
   * must start from this full resource rather than from the trimmed SeriesResource type.
   */
  getSeriesRaw(id: number): Promise<Record<string, unknown>> {
    return this.#api.get<Record<string, unknown>>(`/series/${id}`);
  }

  /** Saves a full series resource (see getSeriesRaw). Files are never moved. */
  async updateSeriesRaw(id: number, series: Record<string, unknown>): Promise<void> {
    await this.#api.put<unknown>(`/series/${id}`, series, { moveFiles: false });
  }

  /**
   * Removes a series from Sonarr. With deleteFiles its folder is deleted from disk too; with
   * exclude, import lists won't add it again.
   */
  async deleteSeries(id: number, deleteFiles: boolean, exclude: boolean): Promise<void> {
    await this.#api.delete<unknown>(`/series/${id}`, {
      deleteFiles,
      addImportListExclusion: exclude,
    });
  }

  getEpisodes(seriesId: number): Promise<EpisodeResource[]> {
    return this.#api.get<EpisodeResource[]>('/episode', { seriesId, includeEpisodeFile: true });
  }

  /** Everything downloading or waiting (the queue is short, so one big page). */
  getQueue(): Promise<PagingResource<QueueResource>> {
    return this.#api.get<PagingResource<QueueResource>>('/queue', {
      page: 1,
      pageSize: 200,
      includeSeries: true,
      includeEpisode: true,
    });
  }

  /** Monitored episodes airing from `start` up to `end` (ISO 8601), with their series. */
  getCalendar(start: string, end: string): Promise<CalendarResource[]> {
    return this.#api.get<CalendarResource[]>('/calendar', {
      start,
      end,
      unmonitored: false,
      includeSeries: true,
    });
  }

  /** Removes a download from the queue and the download client; optionally blocklists it. */
  async removeFromQueue(id: number, blocklist: boolean): Promise<void> {
    await this.#api.delete<unknown>(`/queue/${id}`, { removeFromClient: true, blocklist });
  }

  /** Newest first. */
  getHistory(page: number, pageSize: number): Promise<PagingResource<HistoryResource>> {
    return this.#api.get<PagingResource<HistoryResource>>('/history', {
      page,
      pageSize,
      sortKey: 'date',
      sortDirection: 'descending',
      includeSeries: true,
      includeEpisode: true,
    });
  }

  /** Monitored episodes without a file, or below their cutoff; most recently aired first. */
  getWanted(
    list: WantedList,
    page: number,
    pageSize: number,
  ): Promise<PagingResource<WantedEpisodeResource>> {
    return this.#api.get<PagingResource<WantedEpisodeResource>>(`/wanted/${list}`, {
      page,
      pageSize,
      sortKey: 'episodes.airDateUtc',
      sortDirection: 'descending',
      monitored: true,
      includeSeries: true,
      includeEpisodeFile: list === 'cutoff' ? true : undefined,
    });
  }

  getEpisode(id: number): Promise<EpisodeResource> {
    return this.#api.get<EpisodeResource>(`/episode/${id}`);
  }

  /** Every episode in one file (a file can hold a double episode, for example). */
  getEpisodesByFile(episodeFileId: number): Promise<EpisodeResource[]> {
    return this.#api.get<EpisodeResource[]>('/episode', { episodeFileId });
  }

  /** Deletes the file from disk (to Sonarr's recycling bin, if it has one set up). */
  async deleteEpisodeFile(episodeFileId: number): Promise<void> {
    await this.#api.delete<unknown>(`/episodefile/${episodeFileId}`);
  }

  async setEpisodesMonitored(episodeIds: number[], monitored: boolean): Promise<void> {
    await this.#api.put<unknown>('/episode/monitor', { episodeIds, monitored });
  }

  startCommand(command: SearchCommand): Promise<CommandResource> {
    return this.#api.post<CommandResource>('/command', command);
  }

  getCommand(id: number): Promise<CommandResource> {
    return this.#api.get<CommandResource>(`/command/${id}`);
  }

  /** Searches the indexers and returns every release found, best first, without grabbing any. */
  getReleases(query: ReleaseQuery): Promise<ReleaseResource[]> {
    return this.#api.get<ReleaseResource[]>('/release', query, {
      timeoutMs: RELEASE_SEARCH_TIMEOUT_MS,
    });
  }

  /** Sends a release from a getReleases search (kept 30 minutes) to the download client. */
  async grabRelease(guid: string, indexerId: number): Promise<void> {
    await this.#api.request<unknown>('POST', '/release', {
      body: { guid, indexerId },
      timeoutMs: GRAB_TIMEOUT_MS,
    });
  }

  /** Searches TheTVDB through Sonarr, e.g. 'the expanse' or 'tvdb:280619'. */
  lookupSeries(term: string): Promise<LookupResource[]> {
    return this.#api.get<LookupResource[]>('/series/lookup', { term }, LOOKUP);
  }

  /** Lookup results exactly as Sonarr sends them: adding a series posts one back. */
  lookupSeriesRaw(term: string): Promise<Array<Record<string, unknown>>> {
    return this.#api.get<Array<Record<string, unknown>>>('/series/lookup', { term }, LOOKUP);
  }

  /** Adds a series built from a raw lookup result. Returns the new series. */
  addSeries(series: Record<string, unknown>): Promise<SeriesResource> {
    return this.#api.post<SeriesResource>('/series', series);
  }

  getQualityProfiles(): Promise<QualityProfileResource[]> {
    return this.#api.get<QualityProfileResource[]>('/qualityprofile');
  }

  getRootFolders(): Promise<RootFolderResource[]> {
    return this.#api.get<RootFolderResource[]>('/rootfolder');
  }

  getDiskSpace(): Promise<DiskSpaceResource[]> {
    return this.#api.get<DiskSpaceResource[]>('/diskspace');
  }

  /** Sonarr's 250px-wide poster for a series. */
  getPoster(seriesId: number): Promise<ArrFile> {
    return this.#api.getFile(`/mediacover/${seriesId}/poster-250.jpg`);
  }
}

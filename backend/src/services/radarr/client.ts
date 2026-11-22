import { ArrClient, type ArrFile } from '../../core/arr-client.js';
import type { ArrServiceClient, SystemStatusResource } from '../../core/service-module.js';
import type { ArrServiceConfig } from '../../core/settings-store.js';
import type {
  CommandResource,
  DiskSpaceResource,
  HealthResource,
  HistoryResource,
  LookupResource,
  MovieResource,
  PagingResource,
  QualityProfileResource,
  QueueResource,
  QueueStatusResource,
  ReleaseResource,
  RootFolderResource,
} from './types.js';

/** Searching the indexers interactively can take a while with several slow indexers. */
const RELEASE_SEARCH_TIMEOUT_MS = 180_000;
/** Grabbing fetches the NZB or torrent from the indexer and hands it to the download client. */
const GRAB_TIMEOUT_MS = 60_000;
/** Looking up a movie goes through Radarr to its metadata server. */
const LOOKUP = { timeoutMs: 30_000 };

/** A search Radarr can run as a command. */
export type SearchCommand =
  | { name: 'MoviesSearch'; movieIds: number[] }
  | { name: 'MissingMoviesSearch'; monitored: true }
  | { name: 'CutoffUnmetMoviesSearch'; monitored: true };

/** Which wanted list: missing movies, or movies below their quality cutoff. */
export type WantedList = 'missing' | 'cutoff';

/** Typed calls to the Radarr API (served under /api/v3). */
export class RadarrClient implements ArrServiceClient {
  readonly #api: ArrClient;

  constructor(config: ArrServiceConfig) {
    this.#api = new ArrClient({
      serviceName: 'Radarr',
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

  getMovies(): Promise<MovieResource[]> {
    return this.#api.get<MovieResource[]>('/movie');
  }

  getMovie(id: number): Promise<MovieResource> {
    return this.#api.get<MovieResource>(`/movie/${id}`);
  }

  /**
   * The movie exactly as Radarr sends it. Radarr's PUT replaces the whole movie, so changes
   * must start from this full resource rather than from the trimmed MovieResource type.
   */
  getMovieRaw(id: number): Promise<Record<string, unknown>> {
    return this.#api.get<Record<string, unknown>>(`/movie/${id}`);
  }

  /** Saves a full movie resource (see getMovieRaw). Files are never moved. */
  async updateMovieRaw(id: number, movie: Record<string, unknown>): Promise<void> {
    await this.#api.put<unknown>(`/movie/${id}`, movie, { moveFiles: false });
  }

  /**
   * Removes a movie from Radarr. With deleteFiles its folder is deleted from disk too; with
   * exclude, import lists won't add it again.
   */
  async deleteMovie(id: number, deleteFiles: boolean, exclude: boolean): Promise<void> {
    await this.#api.delete<unknown>(`/movie/${id}`, { deleteFiles, addImportExclusion: exclude });
  }

  /** Deletes the file from disk (to Radarr's recycling bin, if it has one set up). */
  async deleteMovieFile(movieFileId: number): Promise<void> {
    await this.#api.delete<unknown>(`/moviefile/${movieFileId}`);
  }

  /** Monitored movies with a release date from `start` up to `end` (ISO 8601). */
  getCalendar(start: string, end: string): Promise<MovieResource[]> {
    return this.#api.get<MovieResource[]>('/calendar', { start, end, unmonitored: false });
  }

  /** Everything downloading or waiting (the queue is short, so one big page). */
  getQueue(): Promise<PagingResource<QueueResource>> {
    return this.#api.get<PagingResource<QueueResource>>('/queue', {
      page: 1,
      pageSize: 200,
      includeMovie: true,
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
      includeMovie: true,
    });
  }

  /** Monitored, available movies without a file, or below their cutoff. */
  getWanted(
    list: WantedList,
    page: number,
    pageSize: number,
  ): Promise<PagingResource<MovieResource>> {
    return this.#api.get<PagingResource<MovieResource>>(`/wanted/${list}`, {
      page,
      pageSize,
      sortKey: 'movieMetadata.sortTitle',
      sortDirection: 'ascending',
      monitored: true,
    });
  }

  startCommand(command: SearchCommand): Promise<CommandResource> {
    return this.#api.post<CommandResource>('/command', command);
  }

  getCommand(id: number): Promise<CommandResource> {
    return this.#api.get<CommandResource>(`/command/${id}`);
  }

  /** Searches the indexers and returns every release found, best first, without grabbing any. */
  getReleases(movieId: number): Promise<ReleaseResource[]> {
    return this.#api.get<ReleaseResource[]>(
      '/release',
      { movieId },
      { timeoutMs: RELEASE_SEARCH_TIMEOUT_MS },
    );
  }

  /** Sends a release from a getReleases search (kept 30 minutes) to the download client. */
  async grabRelease(guid: string, indexerId: number): Promise<void> {
    await this.#api.request<unknown>('POST', '/release', {
      body: { guid, indexerId },
      timeoutMs: GRAB_TIMEOUT_MS,
    });
  }

  /** Searches TMDb through Radarr, e.g. 'the matrix' or 'tmdb:603'. */
  lookupMovies(term: string): Promise<LookupResource[]> {
    return this.#api.get<LookupResource[]>('/movie/lookup', { term }, LOOKUP);
  }

  /** Lookup results exactly as Radarr sends them: adding a movie posts one back. */
  lookupMoviesRaw(term: string): Promise<Array<Record<string, unknown>>> {
    return this.#api.get<Array<Record<string, unknown>>>('/movie/lookup', { term }, LOOKUP);
  }

  /** Adds a movie built from a raw lookup result. Returns the new movie. */
  addMovie(movie: Record<string, unknown>): Promise<MovieResource> {
    return this.#api.post<MovieResource>('/movie', movie);
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

  /** Radarr's 250px-wide poster for a movie. */
  getPoster(movieId: number): Promise<ArrFile> {
    return this.#api.getFile(`/mediacover/${movieId}/poster-250.jpg`);
  }
}

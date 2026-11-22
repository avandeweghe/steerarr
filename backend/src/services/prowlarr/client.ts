import { ArrClient } from '../../core/arr-client.js';
import type { ArrServiceClient, SystemStatusResource } from '../../core/service-module.js';
import type { ArrServiceConfig } from '../../core/settings-store.js';
import type {
  DownloadClientResource,
  HealthResource,
  IndexerResource,
  IndexerStatusResource,
  SearchResource,
} from './types.js';

/** Prowlarr asks every chosen indexer at once; slow ones can take a while. */
const SEARCH_TIMEOUT_MS = 120_000;
/** Grabbing fetches the NZB or torrent from the indexer and hands it to the download client. */
const GRAB_TIMEOUT_MS = 60_000;

export interface SearchQuery {
  query: string;
  /** Empty for all enabled indexers. */
  indexerIds: number[];
  /** Newznab category ids, e.g. 2000 movies, 5000 TV. Empty for all. */
  categories: number[];
  limit: number;
}

/** Typed calls to the Prowlarr API (served under /api/v1). */
export class ProwlarrClient implements ArrServiceClient {
  readonly #api: ArrClient;

  constructor(config: ArrServiceConfig) {
    this.#api = new ArrClient({
      serviceName: 'Prowlarr',
      baseUrl: config.url,
      apiKey: config.apiKey,
      apiPath: '/api/v1',
    });
  }

  getSystemStatus(): Promise<SystemStatusResource> {
    return this.#api.get<SystemStatusResource>('/system/status');
  }

  getHealth(): Promise<HealthResource[]> {
    return this.#api.get<HealthResource[]>('/health');
  }

  getIndexers(): Promise<IndexerResource[]> {
    return this.#api.get<IndexerResource[]>('/indexer');
  }

  getIndexerStatus(): Promise<IndexerStatusResource[]> {
    return this.#api.get<IndexerStatusResource[]>('/indexerstatus');
  }

  getDownloadClients(): Promise<DownloadClientResource[]> {
    return this.#api.get<DownloadClientResource[]>('/downloadclient');
  }

  /** Searches the indexers. Prowlarr keeps the results a while so one can be grabbed. */
  search(search: SearchQuery): Promise<SearchResource[]> {
    return this.#api.get<SearchResource[]>(
      '/search',
      {
        query: search.query,
        type: 'search',
        indexerIds: search.indexerIds,
        categories: search.categories,
        limit: search.limit,
        offset: 0,
      },
      { timeoutMs: SEARCH_TIMEOUT_MS },
    );
  }

  /** Sends a result from a recent search to a download client (Prowlarr's default if none). */
  async grab(guid: string, indexerId: number, downloadClientId?: number): Promise<void> {
    await this.#api.request<unknown>('POST', '/search', {
      body: { guid, indexerId, downloadClientId },
      timeoutMs: GRAB_TIMEOUT_MS,
    });
  }
}

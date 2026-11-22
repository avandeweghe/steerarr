// Shapes of Prowlarr API responses (/api/v1/...). Only the fields Steerarr uses are listed.

type Protocol = 'unknown' | 'usenet' | 'torrent';

/** GET /api/v1/indexer */
export interface IndexerResource {
  id: number;
  name?: string | null;
  enable: boolean;
  protocol: Protocol;
  privacy?: string | null;
}

/** GET /api/v1/indexerstatus: only indexers with recent failures are listed. */
export interface IndexerStatusResource {
  indexerId: number;
  disabledTill?: string | null;
  mostRecentFailure?: string | null;
}

/** GET /api/v1/downloadclient */
export interface DownloadClientResource {
  id: number;
  name?: string | null;
  enable: boolean;
  protocol: Protocol;
}

/** GET /api/v1/search */
export interface SearchResource {
  guid?: string | null;
  indexerId: number;
  indexer?: string | null;
  title?: string | null;
  size?: number | null;
  publishDate?: string | null;
  ageHours?: number | null;
  protocol: Protocol;
  seeders?: number | null;
  leechers?: number | null;
  grabs?: number | null;
  categories?: Array<{ id?: number; name?: string | null }> | null;
  infoUrl?: string | null;
}

/** GET /api/v1/health */
export interface HealthResource {
  source?: string | null;
  type: 'ok' | 'notice' | 'warning' | 'error';
  message?: string | null;
  wikiUrl?: string | null;
}

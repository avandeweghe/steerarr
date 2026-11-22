// Shapes of Radarr API responses (/api/v3/...). Only the fields Steerarr uses are listed.

export interface MediaCoverResource {
  coverType: 'poster' | 'banner' | 'fanart' | 'screenshot' | 'headshot' | 'clearlogo' | 'unknown';
  /** e.g. /MediaCover/12/poster.jpg?lastWrite=638123 (includes Radarr's URL base). */
  url?: string | null;
  remoteUrl?: string | null;
}

interface QualityModel {
  quality?: { name?: string | null };
}

export interface MovieFileResource {
  id: number;
  size?: number;
  relativePath?: string | null;
  quality?: QualityModel;
}

/** GET /api/v3/movie and /api/v3/movie/{id} */
export interface MovieResource {
  id: number;
  title: string;
  sortTitle?: string | null;
  year: number;
  status: 'tba' | 'announced' | 'inCinemas' | 'released' | 'deleted';
  monitored: boolean;
  overview?: string | null;
  studio?: string | null;
  certification?: string | null;
  genres?: string[] | null;
  images?: MediaCoverResource[] | null;
  hasFile?: boolean;
  isAvailable?: boolean;
  minimumAvailability?: 'announced' | 'inCinemas' | 'released' | 'tba' | 'preDB';
  qualityProfileId?: number;
  sizeOnDisk?: number;
  runtime?: number | null;
  inCinemas?: string | null;
  digitalRelease?: string | null;
  physicalRelease?: string | null;
  movieFile?: MovieFileResource | null;
  statistics?: {
    sizeOnDisk?: number;
    movieFileCount?: number;
    /** The file's quality; wanted lists send this but no movieFile. */
    movieFileQualities?: Array<{ name?: string | null }> | null;
  } | null;
}

/** POST /api/v3/command and GET /api/v3/command/{id} */
export interface CommandResource {
  id: number;
  name?: string | null;
  message?: string | null;
  status: 'queued' | 'started' | 'completed' | 'failed' | 'aborted' | 'cancelled' | 'orphaned';
  result?: 'unknown' | 'successful' | 'unsuccessful';
}

/** GET /api/v3/release?movieId=... */
export interface ReleaseResource {
  guid?: string | null;
  indexerId: number;
  indexer?: string | null;
  title?: string | null;
  quality?: QualityModel;
  size: number;
  ageHours: number;
  protocol: 'unknown' | 'usenet' | 'torrent';
  seeders?: number | null;
  leechers?: number | null;
  languages?: Array<{ name?: string | null }> | null;
  customFormats?: Array<{ name?: string | null }> | null;
  customFormatScore?: number;
  approved: boolean;
  rejections?: string[] | null;
  downloadAllowed: boolean;
}

/** GET /api/v3/movie/lookup?term=... */
export interface LookupResource {
  /** Set (non-zero) when the movie is already in the library. */
  id?: number;
  tmdbId: number;
  title: string;
  year: number;
  status: MovieResource['status'];
  studio?: string | null;
  overview?: string | null;
  runtime?: number | null;
  remotePoster?: string | null;
}

/** GET /api/v3/qualityprofile */
export interface QualityProfileResource {
  id: number;
  name?: string | null;
}

/** GET /api/v3/rootfolder */
export interface RootFolderResource {
  id: number;
  path?: string | null;
  accessible: boolean;
  freeSpace?: number | null;
  totalSpace?: number | null;
}

/** GET /api/v3/diskspace */
export interface DiskSpaceResource {
  path?: string | null;
  label?: string | null;
  freeSpace: number;
  totalSpace: number;
}

/** Radarr's paged lists (queue, history, wanted). */
export interface PagingResource<T> {
  page: number;
  pageSize: number;
  totalRecords: number;
  records?: T[] | null;
}

/** GET /api/v3/queue?includeMovie=true */
export interface QueueResource {
  id: number;
  movieId?: number | null;
  movie?: { title?: string | null; year?: number | null } | null;
  quality?: QualityModel;
  size: number;
  sizeleft: number;
  /** e.g. "00:12:34", or "1.02:03:04" with days. */
  timeleft?: string | null;
  title?: string | null;
  status: string;
  trackedDownloadStatus?: 'ok' | 'warning' | 'error' | null;
  trackedDownloadState?: string | null;
  statusMessages?: Array<{ title?: string | null; messages?: string[] | null }> | null;
  errorMessage?: string | null;
  protocol: 'unknown' | 'usenet' | 'torrent';
  downloadClient?: string | null;
  indexer?: string | null;
}

/** GET /api/v3/history?includeMovie=true */
export interface HistoryResource {
  id: number;
  movieId: number;
  sourceTitle?: string | null;
  quality?: QualityModel;
  date: string;
  eventType: string;
  data?: Record<string, string | null> | null;
  movie?: { title?: string | null } | null;
}

/** GET /api/v3/health */
export interface HealthResource {
  source?: string | null;
  type: 'ok' | 'notice' | 'warning' | 'error';
  message?: string | null;
  wikiUrl?: string | null;
}

/** GET /api/v3/queue/status */
export interface QueueStatusResource {
  totalCount: number;
  count: number;
}

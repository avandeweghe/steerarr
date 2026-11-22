// Shapes of Sonarr v4 API responses (/api/v3/...). Only the fields Steerarr uses are listed.

export interface MediaCoverResource {
  coverType: 'poster' | 'banner' | 'fanart' | 'screenshot' | 'headshot' | 'clearlogo' | 'unknown';
  /** e.g. /MediaCover/12/poster.jpg?lastWrite=638123 (includes Sonarr's URL base). */
  url?: string;
  remoteUrl?: string;
}

export interface SeriesStatisticsResource {
  seasonCount: number;
  episodeFileCount: number;
  episodeCount: number;
  totalEpisodeCount: number;
  sizeOnDisk: number;
  percentOfEpisodes: number;
}

export interface SeasonStatisticsResource {
  episodeFileCount: number;
  episodeCount: number;
  totalEpisodeCount: number;
  sizeOnDisk: number;
}

export interface SeasonResource {
  seasonNumber: number;
  monitored: boolean;
  statistics?: SeasonStatisticsResource;
}

/** GET /api/v3/series and /api/v3/series/{id} */
export interface SeriesResource {
  id: number;
  title: string;
  sortTitle: string;
  year: number;
  status: 'continuing' | 'ended' | 'upcoming' | 'deleted';
  monitored: boolean;
  overview?: string | null;
  network?: string | null;
  images: MediaCoverResource[];
  seasons?: SeasonResource[];
  nextAiring?: string;
  qualityProfileId?: number;
  statistics?: SeriesStatisticsResource;
}

interface QualityModel {
  quality?: { name?: string | null };
}

/** GET /api/v3/episode?seriesId=...&includeEpisodeFile=true */
export interface EpisodeResource {
  id: number;
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  title?: string | null;
  overview?: string | null;
  airDateUtc?: string | null;
  monitored: boolean;
  hasFile: boolean;
  /** 0 when there's no file. */
  episodeFileId?: number;
  episodeFile?: { size?: number; quality?: QualityModel } | null;
}

/** POST /api/v3/command and GET /api/v3/command/{id} */
export interface CommandResource {
  id: number;
  name?: string | null;
  message?: string | null;
  status: 'queued' | 'started' | 'completed' | 'failed' | 'aborted' | 'cancelled' | 'orphaned';
  result?: 'unknown' | 'successful' | 'unsuccessful';
}

/** GET /api/v3/release?episodeId=... or ?seriesId=...&seasonNumber=... */
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
  customFormatScore: number;
  fullSeason: boolean;
  approved: boolean;
  rejections?: string[] | null;
  downloadAllowed: boolean;
}

/** GET /api/v3/series/lookup?term=... */
export interface LookupResource {
  /** Set (non-zero) when the series is already in the library. */
  id?: number;
  tvdbId: number;
  title: string;
  year: number;
  status: 'continuing' | 'ended' | 'upcoming' | 'deleted';
  network?: string | null;
  overview?: string | null;
  remotePoster?: string | null;
  seriesType?: 'standard' | 'daily' | 'anime';
  statistics?: { seasonCount?: number };
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
  /** Often missing; the disk it's on (GET /api/v3/diskspace) has the total. */
  totalSpace?: number | null;
}

/** GET /api/v3/diskspace: each disk Sonarr can see. */
export interface DiskSpaceResource {
  path?: string | null;
  label?: string | null;
  freeSpace: number;
  totalSpace: number;
}

/** Sonarr's paged lists (queue, history, wanted). */
export interface PagingResource<T> {
  page: number;
  pageSize: number;
  totalRecords: number;
  records?: T[] | null;
}

interface EpisodeSummary {
  seasonNumber: number;
  episodeNumber: number;
  title?: string | null;
}

/** GET /api/v3/calendar?includeSeries=true: episodes airing between two dates. */
export interface CalendarResource extends EpisodeResource {
  /** Minutes; 0 when TheTVDB doesn't say (the series' runtime is then the best guess). */
  runtime?: number | null;
  finaleType?: 'series' | 'season' | 'midseason' | null;
  series?: {
    id: number;
    title?: string | null;
    network?: string | null;
    runtime?: number | null;
    images?: MediaCoverResource[] | null;
  } | null;
}

/** GET /api/v3/queue?includeSeries=true&includeEpisode=true */
export interface QueueResource {
  id: number;
  seriesId?: number | null;
  episodeId?: number | null;
  series?: { title?: string | null } | null;
  episode?: EpisodeSummary | null;
  quality?: { quality?: { name?: string | null } };
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

/** GET /api/v3/history?includeSeries=true&includeEpisode=true */
export interface HistoryResource {
  id: number;
  seriesId: number;
  sourceTitle?: string | null;
  quality?: { quality?: { name?: string | null } };
  date: string;
  eventType: string;
  data?: Record<string, string | null> | null;
  series?: { title?: string | null } | null;
  episode?: EpisodeSummary | null;
}

/** GET /api/v3/wanted/missing and /wanted/cutoff, with includeSeries (and includeEpisodeFile). */
export interface WantedEpisodeResource extends EpisodeResource {
  series?: { title?: string | null } | null;
}

/** GET /api/v3/health: Sonarr's own checks (System > Status). */
export interface HealthResource {
  source?: string | null;
  type: 'ok' | 'notice' | 'warning' | 'error';
  message?: string | null;
  /** Sonarr's wiki page about the problem. */
  wikiUrl?: string | null;
}

/** GET /api/v3/queue/status */
export interface QueueStatusResource {
  totalCount: number;
  count: number;
}

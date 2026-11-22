import type { ArrStatus, Page } from './api.js';

/** GET /api/sonarr/system/status */
export type SonarrStatus = ArrStatus;

export type SonarrSeriesStatus = 'continuing' | 'ended' | 'upcoming' | 'deleted';

/** One series in GET /api/sonarr/series (sorted by title). */
export interface SonarrSeries {
  id: number;
  title: string;
  year: number;
  status: SonarrSeriesStatus;
  monitored: boolean;
  network: string | null;
  /** The quality profile episodes are downloaded with, e.g. "HD-1080p". */
  qualityProfile: string | null;
  /** Small poster served by Steerarr (relative URL), or null when Sonarr has none. */
  posterUrl: string | null;
  seasonCount: number;
  /** Episodes that have a file. */
  episodeFileCount: number;
  /** Monitored episodes that have aired or have a file: Sonarr's "have / want" total. */
  episodeCount: number;
  sizeOnDisk: number;
  /** ISO 8601, when the next episode airs. */
  nextAiring: string | null;
}

/** One season in GET /api/sonarr/series/:id. */
export interface SonarrSeason {
  /** 0 is specials. */
  seasonNumber: number;
  monitored: boolean;
  episodeFileCount: number;
  /** Monitored episodes that have aired or have a file: Sonarr's "have / want" total. */
  episodeCount: number;
  totalEpisodeCount: number;
  sizeOnDisk: number;
}

/** One episode in GET /api/sonarr/series/:id. */
export interface SonarrEpisode {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  overview: string | null;
  /** ISO 8601, or null when the air date isn't known yet. */
  airDateUtc: string | null;
  monitored: boolean;
  hasFile: boolean;
  /** The file's quality, e.g. "WEBDL-1080p", when there is a file. */
  quality: string | null;
  /** The file's size in bytes, when there is a file. */
  size: number | null;
}

/** GET /api/sonarr/series/:id */
export interface SonarrSeriesDetail extends SonarrSeries {
  overview: string | null;
  /** Newest season first, specials last. */
  seasons: SonarrSeason[];
  /** By season, then episode number. */
  episodes: SonarrEpisode[];
}

/** Body of the PUT .../monitored routes. */
export interface SonarrMonitorRequest {
  monitored: boolean;
}

/** A search Sonarr is running: from the POST .../search routes and GET /api/sonarr/commands/:id. */
export interface SonarrCommand {
  id: number;
  /** True once Sonarr has finished with it, whether it worked or not. */
  done: boolean;
  /** True when it finished without errors (it may still have found nothing). */
  succeeded: boolean;
  /** Sonarr's latest status text, e.g. "Episode search completed. 1 reports downloaded." */
  message: string | null;
}

/** One release in GET /api/sonarr/episodes/:id/releases or .../seasons/:season/releases. */
export interface SonarrRelease {
  guid: string;
  indexerId: number;
  indexer: string;
  title: string;
  /** e.g. "WEBDL-1080p". */
  quality: string;
  size: number;
  ageHours: number;
  protocol: 'usenet' | 'torrent' | 'unknown';
  /** Torrents only. */
  seeders: number | null;
  leechers: number | null;
  languages: string[];
  customFormats: string[];
  customFormatScore: number;
  fullSeason: boolean;
  /** Sonarr would grab it on its own. */
  approved: boolean;
  /** Why Sonarr wouldn't grab it on its own. Empty when approved. */
  rejections: string[];
  /** False when Sonarr can't grab it at all (e.g. it can't tell which episodes it is). */
  downloadAllowed: boolean;
}

/** Body of POST /api/sonarr/releases: grabs a release from a recent search. */
export interface SonarrGrabRequest {
  guid: string;
  indexerId: number;
}

export type SonarrSeriesType = 'standard' | 'daily' | 'anime';

/** Which episodes to monitor when adding a series (a subset of Sonarr's choices). */
export type SonarrMonitorOption =
  | 'all'
  | 'future'
  | 'missing'
  | 'existing'
  | 'recent'
  | 'pilot'
  | 'firstSeason'
  | 'lastSeason'
  | 'none';

/** One result in GET /api/sonarr/lookup?term=... (a search of TheTVDB through Sonarr). */
export interface SonarrLookupResult {
  tvdbId: number;
  title: string;
  year: number;
  status: SonarrSeriesStatus;
  network: string | null;
  overview: string | null;
  seasonCount: number;
  /** TheTVDB's poster (an absolute https URL), or null. */
  posterUrl: string | null;
  seriesType: SonarrSeriesType;
  /** The series' id in Sonarr when it's already in the library, else null. */
  existingId: number | null;
}

/** GET /api/sonarr/add-options: the choices the add form offers. */
export interface SonarrAddOptions {
  qualityProfiles: Array<{ id: number; name: string }>;
  rootFolders: Array<{ id: number; path: string; freeSpace: number | null; accessible: boolean }>;
  /** The profile chosen in Steerarr's settings to start with, if it still exists. */
  defaultQualityProfileId: number | null;
}

/** Body of POST /api/sonarr/series. */
export interface SonarrAddRequest {
  tvdbId: number;
  qualityProfileId: number;
  rootFolderPath: string;
  monitor: SonarrMonitorOption;
  seriesType: SonarrSeriesType;
  seasonFolder: boolean;
  /** Monitor seasons that are added to the series later. */
  monitorNewSeasons: boolean;
  /** Start searching for the monitored missing episodes right away. */
  search: boolean;
}

/** Response of POST /api/sonarr/series. */
export interface SonarrAddResponse {
  id: number;
}

/** Which episode an Activity or Wanted entry is about. */
export interface SonarrEpisodeRef {
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
}

/** One download in GET /api/sonarr/queue. */
export interface SonarrQueueItem {
  id: number;
  /** The release's name. */
  title: string;
  seriesId: number | null;
  seriesTitle: string | null;
  episode: SonarrEpisodeRef | null;
  quality: string;
  size: number;
  sizeLeft: number;
  /** Seconds until done, as the download client estimates it. */
  timeLeft: number | null;
  /** Sonarr's status, e.g. "downloading", "queued", "paused", "completed", "delay". */
  status: string;
  /** Where Sonarr is with it, e.g. "downloading", "importPending", "importBlocked". */
  state: string | null;
  health: 'ok' | 'warning' | 'error';
  /** Why it's stuck or failing, in Sonarr's words. */
  messages: string[];
  protocol: 'usenet' | 'torrent' | 'unknown';
  downloadClient: string | null;
  indexer: string | null;
}

export type SonarrHistoryEvent =
  'grabbed' | 'imported' | 'failed' | 'deleted' | 'renamed' | 'ignored' | 'unknown';

/** One event in GET /api/sonarr/history. */
export interface SonarrHistoryItem {
  id: number;
  event: SonarrHistoryEvent;
  /** ISO 8601. */
  date: string;
  /** The release or file name. */
  sourceTitle: string;
  quality: string;
  seriesId: number;
  seriesTitle: string | null;
  episode: SonarrEpisodeRef | null;
  /** More about it when Sonarr says: the indexer, why it failed or was deleted. */
  detail: string | null;
}

/** One episode in GET /api/sonarr/wanted/missing or /wanted/cutoff. */
export interface SonarrWantedEpisode {
  id: number;
  seriesId: number;
  seriesTitle: string;
  episode: SonarrEpisodeRef;
  /** ISO 8601, or null when the air date isn't known. */
  airDateUtc: string | null;
  /** The current file's quality (cutoff not met only). */
  quality: string | null;
}

/** How an episode ends a run: the last of the series, of a season, or before a mid-season break. */
export type SonarrFinale = 'series' | 'season' | 'midseason';

/** One episode in GET /api/sonarr/calendar?start=...&end=... (monitored only, by air time). */
export interface SonarrCalendarEpisode {
  id: number;
  seriesId: number;
  seriesTitle: string;
  network: string | null;
  /** Small poster served by Steerarr (relative URL), or null when Sonarr has none. */
  posterUrl: string | null;
  episode: SonarrEpisodeRef;
  /** ISO 8601. */
  airDateUtc: string;
  /** Minutes, or null when unknown. */
  runtime: number | null;
  hasFile: boolean;
  /** In Sonarr's download queue right now. */
  downloading: boolean;
  finale: SonarrFinale | null;
}

/** One of Sonarr's health checks (System > Status in Sonarr). */
export interface SonarrHealthCheck {
  /** Which check, e.g. "IndexerStatusCheck". */
  source: string | null;
  level: 'notice' | 'warning' | 'error';
  message: string;
  /** Sonarr's wiki page about it (https only), or null. */
  wikiUrl: string | null;
}

/** A root folder and the space on the disk it's on. */
export interface SonarrRootFolderSpace {
  path: string;
  accessible: boolean;
  /** Bytes, or null when Sonarr doesn't know. */
  freeSpace: number | null;
  totalSpace: number | null;
}

/** GET /api/sonarr/status: Sonarr's own status page. */
export interface SonarrStatusPage {
  version: string;
  branch: string;
  /** ISO 8601: when Sonarr started, for its uptime. */
  startTime: string;
  /** Problems first (errors, warnings, then notices). Empty when all is well. */
  health: SonarrHealthCheck[];
  rootFolders: SonarrRootFolderSpace[];
}

/** A page of a longer list: history and wanted. */
export type SonarrPage<T> = Page<T>;

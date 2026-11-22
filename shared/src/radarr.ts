import type { ArrStatus, Page } from './api.js';

/** GET /api/radarr/system/status */
export type RadarrStatus = ArrStatus;

/** Where a movie is in its life: Radarr's own stages. */
export type RadarrMovieStatus = 'tba' | 'announced' | 'inCinemas' | 'released' | 'deleted';

/** When Radarr starts looking for a movie. */
export type RadarrAvailability = 'announced' | 'inCinemas' | 'released';

/** One movie in GET /api/radarr/movies (sorted by title). */
export interface RadarrMovie {
  id: number;
  title: string;
  year: number;
  status: RadarrMovieStatus;
  monitored: boolean;
  studio: string | null;
  /** Small poster served by Steerarr (relative URL), or null when Radarr has none. */
  posterUrl: string | null;
  hasFile: boolean;
  /** The file's quality, e.g. "Bluray-1080p", when there is a file. */
  quality: string | null;
  /** The quality profile it's downloaded with, e.g. "HD-1080p". */
  qualityProfile: string | null;
  /** Radarr considers it out (past its minimum availability), so a missing file is missing. */
  isAvailable: boolean;
  sizeOnDisk: number;
  /** Minutes, or null when unknown. */
  runtime: number | null;
  /** ISO 8601 release dates, each null when unknown. */
  inCinemas: string | null;
  digitalRelease: string | null;
  physicalRelease: string | null;
}

/** The movie's file, when it has one. */
export interface RadarrMovieFile {
  /** e.g. "Bluray-1080p". */
  quality: string;
  size: number;
  /** The file name inside the movie's folder. */
  relativePath: string | null;
}

/** GET /api/radarr/movies/:id */
export interface RadarrMovieDetail extends RadarrMovie {
  overview: string | null;
  certification: string | null;
  genres: string[];
  minimumAvailability: RadarrAvailability;
  file: RadarrMovieFile | null;
}

/** Body of PUT /api/radarr/movies/:id/monitored. */
export interface RadarrMonitorRequest {
  monitored: boolean;
}

/** A search Radarr is running: from the POST .../search routes and GET /api/radarr/commands/:id. */
export interface RadarrCommand {
  id: number;
  /** True once Radarr has finished with it, whether it worked or not. */
  done: boolean;
  /** True when it finished without errors (it may still have found nothing). */
  succeeded: boolean;
  /** Radarr's latest status text. */
  message: string | null;
}

/** One release in GET /api/radarr/movies/:id/releases. */
export interface RadarrRelease {
  guid: string;
  indexerId: number;
  indexer: string;
  title: string;
  /** e.g. "Bluray-1080p". */
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
  /** Radarr would grab it on its own. */
  approved: boolean;
  /** Why Radarr wouldn't grab it on its own. Empty when approved. */
  rejections: string[];
  /** False when Radarr can't grab it at all. */
  downloadAllowed: boolean;
}

/** Body of POST /api/radarr/releases: grabs a release from a recent search. */
export interface RadarrGrabRequest {
  guid: string;
  indexerId: number;
}

/** One result in GET /api/radarr/lookup?term=... (a search of TMDb through Radarr). */
export interface RadarrLookupResult {
  tmdbId: number;
  title: string;
  year: number;
  status: RadarrMovieStatus;
  studio: string | null;
  overview: string | null;
  runtime: number | null;
  /** TMDb's poster (an absolute https URL), or null. */
  posterUrl: string | null;
  /** The movie's id in Radarr when it's already in the library, else null. */
  existingId: number | null;
}

/** GET /api/radarr/add-options: the choices the add form offers. */
export interface RadarrAddOptions {
  qualityProfiles: Array<{ id: number; name: string }>;
  rootFolders: Array<{ id: number; path: string; freeSpace: number | null; accessible: boolean }>;
  /** The profile chosen in Steerarr's settings to start with, if it still exists. */
  defaultQualityProfileId: number | null;
}

/** Body of POST /api/radarr/movies. */
export interface RadarrAddRequest {
  tmdbId: number;
  qualityProfileId: number;
  rootFolderPath: string;
  monitored: boolean;
  minimumAvailability: RadarrAvailability;
  /** Start searching for it right away. */
  search: boolean;
}

/** Response of POST /api/radarr/movies. */
export interface RadarrAddResponse {
  id: number;
}

/** One download in GET /api/radarr/queue. */
export interface RadarrQueueItem {
  id: number;
  /** The release's name. */
  title: string;
  movieId: number | null;
  movieTitle: string | null;
  movieYear: number | null;
  quality: string;
  size: number;
  sizeLeft: number;
  /** Seconds until done, as the download client estimates it. */
  timeLeft: number | null;
  /** Radarr's status, e.g. "downloading", "queued", "paused", "completed", "delay". */
  status: string;
  /** Where Radarr is with it, e.g. "downloading", "importPending", "importBlocked". */
  state: string | null;
  health: 'ok' | 'warning' | 'error';
  /** Why it's stuck or failing, in Radarr's words. */
  messages: string[];
  protocol: 'usenet' | 'torrent' | 'unknown';
  downloadClient: string | null;
  indexer: string | null;
}

export type RadarrHistoryEvent =
  'grabbed' | 'imported' | 'failed' | 'deleted' | 'renamed' | 'ignored' | 'unknown';

/** One event in GET /api/radarr/history. */
export interface RadarrHistoryItem {
  id: number;
  event: RadarrHistoryEvent;
  /** ISO 8601. */
  date: string;
  /** The release or file name. */
  sourceTitle: string;
  quality: string;
  movieId: number;
  movieTitle: string | null;
  /** More about it when Radarr says: the indexer, why it failed or was deleted. */
  detail: string | null;
}

/** One movie in GET /api/radarr/wanted/missing or /wanted/cutoff. */
export interface RadarrWantedMovie {
  id: number;
  title: string;
  year: number;
  posterUrl: string | null;
  /** The current file's quality (cutoff not met only). */
  quality: string | null;
  /** ISO 8601: the release that made it available (digital, physical or cinema), if known. */
  releasedOn: string | null;
}

/** Which release a calendar entry is for. */
export type RadarrReleaseKind = 'cinemas' | 'digital' | 'physical';

/** One release date in GET /api/radarr/calendar?start=...&end=... (monitored movies only). */
export interface RadarrCalendarEntry {
  movieId: number;
  title: string;
  year: number;
  studio: string | null;
  posterUrl: string | null;
  kind: RadarrReleaseKind;
  /** ISO 8601, the release date (a whole day: midnight UTC). */
  date: string;
  hasFile: boolean;
  /** In Radarr's download queue right now. */
  downloading: boolean;
}

/** One of Radarr's health checks (System > Status in Radarr). */
export interface RadarrHealthCheck {
  source: string | null;
  level: 'notice' | 'warning' | 'error';
  message: string;
  /** Radarr's wiki page about it (https only), or null. */
  wikiUrl: string | null;
}

/** A root folder and the space on the disk it's on. */
export interface RadarrRootFolderSpace {
  path: string;
  accessible: boolean;
  freeSpace: number | null;
  totalSpace: number | null;
}

/** GET /api/radarr/status: Radarr's own status page. */
export interface RadarrStatusPage {
  version: string;
  branch: string;
  /** ISO 8601: when Radarr started, for its uptime. */
  startTime: string;
  /** Problems first (errors, warnings, then notices). Empty when all is well. */
  health: RadarrHealthCheck[];
  rootFolders: RadarrRootFolderSpace[];
}

/** A page of a longer list: history and wanted. */
export type RadarrPage<T> = Page<T>;

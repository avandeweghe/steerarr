import type { ArrStatus } from './api.js';

/** GET /api/prowlarr/system/status */
export type ProwlarrStatus = ArrStatus;

export type ProwlarrProtocol = 'usenet' | 'torrent' | 'unknown';

/** What to search: everything, or one of the Newznab/Torznab top categories. */
export type ProwlarrSearchKind = 'all' | 'movies' | 'tv' | 'audio' | 'books';

/** One indexer in GET /api/prowlarr/indexers. */
export interface ProwlarrIndexer {
  id: number;
  name: string;
  enabled: boolean;
  protocol: ProwlarrProtocol;
  /** "public", "semiPrivate" or "private". */
  privacy: string | null;
  /** Prowlarr has paused it after failures, until this time (ISO 8601). */
  disabledUntil: string | null;
  /** Why it last failed, when it has. */
  lastFailure: string | null;
}

/** One download client in GET /api/prowlarr/download-clients (enabled ones only). */
export interface ProwlarrDownloadClient {
  id: number;
  name: string;
  protocol: ProwlarrProtocol;
}

/** One result in GET /api/prowlarr/search?query=... */
export interface ProwlarrResult {
  /** With indexerId, what grabbing it sends back. */
  guid: string;
  indexerId: number;
  indexer: string;
  title: string;
  size: number;
  /** Hours since it was posted, or null when the indexer doesn't say. */
  ageHours: number | null;
  protocol: ProwlarrProtocol;
  /** Torrents only. */
  seeders: number | null;
  leechers: number | null;
  /** How many times it was downloaded, when the indexer says. */
  grabs: number | null;
  /** e.g. "Movies/HD", "TV/UHD". */
  categories: string[];
  /** The indexer's page about it (https only), or null. */
  infoUrl: string | null;
}

/** Body of POST /api/prowlarr/grab: sends a result from a recent search to a download client. */
export interface ProwlarrGrabRequest {
  guid: string;
  indexerId: number;
  /** Which download client; Prowlarr picks its default for the protocol when left out. */
  downloadClientId?: number;
}

/** One of Prowlarr's health checks. */
export interface ProwlarrHealthCheck {
  source: string | null;
  level: 'notice' | 'warning' | 'error';
  message: string;
  /** Prowlarr's wiki page about it (https only), or null. */
  wikiUrl: string | null;
}

/** GET /api/prowlarr/status: Prowlarr's own status page. */
export interface ProwlarrStatusPage {
  version: string;
  branch: string;
  /** ISO 8601: when Prowlarr started, for its uptime. */
  startTime: string;
  /** Problems first. Empty when all is well. */
  health: ProwlarrHealthCheck[];
}

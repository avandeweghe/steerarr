/** NZBGet's overall state, part of GET /api/nzbget/queue. */
export interface NzbgetStatus {
  /** Downloading is paused (Pause in NZBGet's web UI). */
  paused: boolean;
  /** Bytes per second right now. */
  downloadRate: number;
  /** The speed limit in bytes per second, or 0 for none. */
  speedLimit: number;
  /** Bytes still to download across the queue. */
  remaining: number;
}

/** What a download is doing, simplified from NZBGet's status. */
export type NzbgetItemState = 'downloading' | 'queued' | 'paused' | 'processing' | 'other';

/** One download in GET /api/nzbget/queue. */
export interface NzbgetQueueItem {
  id: number;
  name: string;
  category: string | null;
  /** Bytes in total, and still to download. */
  size: number;
  remaining: number;
  state: NzbgetItemState;
  /** NZBGet's own status, e.g. "DOWNLOADING", "UNPACKING", "PP_QUEUED". */
  status: string;
  /** What post-processing is doing, e.g. "Unpacking", and how far (0 to 1). */
  stage: string | null;
  stageProgress: number | null;
  /** NZBGet's priority: -100 very low, 0 normal, 50 high, 100 very high, 900 force. */
  priority: number;
  /** Article health from 0 to 1; below about 0.95 the download may fail. */
  health: number;
}

/** GET /api/nzbget/queue: the overall state and the downloads, in queue order. */
export interface NzbgetQueue {
  status: NzbgetStatus;
  items: NzbgetQueueItem[];
}

/** How a download in the history ended. */
export type NzbgetOutcome = 'success' | 'warning' | 'failure' | 'deleted';

/** One entry in GET /api/nzbget/history. */
export interface NzbgetHistoryItem {
  id: number;
  name: string;
  category: string | null;
  size: number;
  /** ISO 8601. */
  time: string;
  outcome: NzbgetOutcome;
  /** NZBGet's status, e.g. "SUCCESS/ALL", "FAILURE/PAR", "DELETED/MANUAL". */
  status: string;
  /** What the status means, e.g. "Verified" or "Unpacking failed". Null for a plain success. */
  detail: string | null;
}

/** Actions on one download in the queue (POST /api/nzbget/queue/:id/:action). */
export type NzbgetItemAction = 'pause' | 'resume' | 'top' | 'bottom';

/** Body of PUT /api/nzbget/queue/:id/category. An empty string means no category. */
export interface NzbgetCategoryRequest {
  category: string;
}

/**
 * How to remove a download from the queue (DELETE /api/nzbget/queue/:id?mode=), as NZBGet's
 * own Delete asks: keep the downloaded files and move it to the history, delete the files and
 * move it to the history, or delete the files without keeping it in the history.
 */
export type NzbgetDeleteMode = 'keepFiles' | 'deleteFiles' | 'noHistory';

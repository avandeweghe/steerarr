// Shapes of NZBGet 26 JSON-RPC results (/jsonrpc). Only the fields Steerarr uses are listed.
// Sizes over 4 GiB come as two 32-bit halves: <Name>Lo and <Name>Hi.

/** status */
export interface StatusResource {
  RemainingSizeLo: number;
  RemainingSizeHi: number;
  DownloadRateLo?: number;
  DownloadRateHi?: number;
  /** Bytes per second; deprecated in favour of the Lo/Hi pair but still sent. */
  DownloadRate: number;
  /** Bytes per second, 0 for no limit. */
  DownloadLimit: number;
  DownloadPaused: boolean;
  UpTimeSec: number;
  QuotaReached?: boolean;
}

/** One entry of listgroups. */
export interface GroupResource {
  NZBID: number;
  NZBName: string;
  Category?: string | null;
  FileSizeLo: number;
  FileSizeHi: number;
  RemainingSizeLo: number;
  RemainingSizeHi: number;
  /** e.g. QUEUED, PAUSED, DOWNLOADING, PP_QUEUED, UNPACKING. */
  Status: string;
  MaxPriority: number;
  /** Per mille (1000 = all articles there). */
  Health: number;
  PostInfoText?: string | null;
  /** Per mille. */
  PostStageProgress?: number | null;
}

/** One entry of history. */
export interface HistoryResource {
  NZBID: number;
  Name: string;
  Category?: string | null;
  FileSizeLo: number;
  FileSizeHi: number;
  /** Unix time in seconds. */
  HistoryTime: number;
  /** e.g. SUCCESS/ALL, WARNING/DAMAGED, FAILURE/PAR, DELETED/MANUAL. */
  Status: string;
}

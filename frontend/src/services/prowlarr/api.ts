import type {
  ProwlarrDownloadClient,
  ProwlarrGrabRequest,
  ProwlarrIndexer,
  ProwlarrResult,
  ProwlarrSearchKind,
  ProwlarrStatusPage,
} from '@steerarr/shared';
import { api } from '../../lib/api';

/** Searches the chosen indexers (all when none) in one category. Can take a minute. */
export function search(
  query: string,
  kind: ProwlarrSearchKind,
  indexerIds: number[],
  signal?: AbortSignal,
): Promise<ProwlarrResult[]> {
  const params = new URLSearchParams({ query, kind, indexers: indexerIds.join(',') });
  return api<ProwlarrResult[]>(`prowlarr/search?${params}`, { signal });
}

/** Sends a result from a recent search to a download client. */
export function grab(request: ProwlarrGrabRequest): Promise<void> {
  return api<void>('prowlarr/grab', { method: 'POST', body: request });
}

export function getIndexers(signal?: AbortSignal): Promise<ProwlarrIndexer[]> {
  return api<ProwlarrIndexer[]>('prowlarr/indexers', { signal });
}

/** Enabled download clients only. */
export function getDownloadClients(signal?: AbortSignal): Promise<ProwlarrDownloadClient[]> {
  return api<ProwlarrDownloadClient[]>('prowlarr/download-clients', { signal });
}

export function getStatusPage(signal?: AbortSignal): Promise<ProwlarrStatusPage> {
  return api<ProwlarrStatusPage>('prowlarr/status', { signal });
}

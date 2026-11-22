import type {
  NzbgetCategoryRequest,
  NzbgetDeleteMode,
  NzbgetHistoryItem,
  NzbgetItemAction,
  NzbgetQueue,
  Page,
} from '@steerarr/shared';
import { api } from '../../lib/api';

export function getQueue(): Promise<NzbgetQueue> {
  return api<NzbgetQueue>('nzbget/queue');
}

/** Pauses or resumes all downloading. */
export function setPaused(paused: boolean): Promise<void> {
  return api<void>(`nzbget/queue/${paused ? 'pause' : 'resume'}`, { method: 'POST' });
}

export function changeItem(id: number, action: NzbgetItemAction): Promise<void> {
  return api<void>(`nzbget/queue/${id}/${action}`, { method: 'POST' });
}

/** Removes a download from the queue, in one of the ways NZBGet's own Delete offers. */
export function removeItem(id: number, mode: NzbgetDeleteMode): Promise<void> {
  return api<void>(`nzbget/queue/${id}?mode=${mode}`, { method: 'DELETE' });
}

export function getHistory(page: number): Promise<Page<NzbgetHistoryItem>> {
  return api<Page<NzbgetHistoryItem>>(`nzbget/history?page=${page}`);
}

/** The category names set up in NZBGet. */
export function getCategories(): Promise<string[]> {
  return api<string[]>('nzbget/categories');
}

/** Moves a download to another category ("" for none), applying that category's settings. */
export function setCategory(id: number, category: string): Promise<void> {
  const body: NzbgetCategoryRequest = { category };
  return api<void>(`nzbget/queue/${id}/category`, { method: 'PUT', body });
}

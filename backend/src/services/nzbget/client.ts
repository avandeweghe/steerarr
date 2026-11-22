import { ArrClient } from '../../core/arr-client.js';
import type { ArrServiceClient, SystemStatusResource } from '../../core/service-module.js';
import type { ArrServiceConfig } from '../../core/settings-store.js';
import { UpstreamError } from '../../core/upstream-error.js';
import type { GroupResource, HistoryResource, StatusResource } from './types.js';

/** The editqueue commands Steerarr uses. */
export type EditCommand =
  | 'GroupPause'
  | 'GroupResume'
  | 'GroupMoveTop'
  | 'GroupMoveBottom'
  | 'GroupDelete'
  | 'GroupParkDelete'
  | 'GroupFinalDelete'
  | 'GroupApplyCategory';

/** NZBGet's option names for categories: Category1.Name, Category2.Name, … */
const CATEGORY_NAME = /^Category\d+\.Name$/i;

interface RpcResponse {
  result?: unknown;
  error?: { name?: string; code?: number; message?: string } | null;
}

/** NZBGet's JSON-RPC API at <address>/jsonrpc, with its control username and password. */
export class NzbgetClient implements ArrServiceClient {
  readonly #api: ArrClient;

  constructor(config: ArrServiceConfig) {
    this.#api = new ArrClient({
      serviceName: 'NZBGet',
      baseUrl: config.url,
      apiPath: '',
      login: { username: config.username ?? '', password: config.apiKey },
    });
  }

  /** Calls one method. NZBGet reports its own errors in the body, with HTTP 200. */
  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const response = await this.#api.post<RpcResponse | undefined>('/jsonrpc', {
      method,
      params,
      id: 1,
    });
    if (response?.error) {
      const message = response.error.message ?? 'the request failed';
      throw new UpstreamError(`NZBGet: ${message}`, { service: 'NZBGet', kind: 'http' });
    }
    if (!response || !('result' in response)) {
      throw new UpstreamError("NZBGet's answer had no result. Check NZBGet's address.", {
        service: 'NZBGet',
        kind: 'http',
      });
    }
    return response.result as T;
  }

  /** Used to test the connection; NZBGet has no instance name, so it's the app name. */
  async getSystemStatus(): Promise<SystemStatusResource> {
    const [version, status] = await Promise.all([this.call<string>('version'), this.getStatus()]);
    const startTime = new Date(Date.now() - status.UpTimeSec * 1000).toISOString();
    return { appName: 'NZBGet', instanceName: 'NZBGet', version, branch: '', startTime };
  }

  getVersion(): Promise<string> {
    return this.call<string>('version');
  }

  getStatus(): Promise<StatusResource> {
    return this.call<StatusResource>('status');
  }

  /** The queue, in download order. */
  listGroups(): Promise<GroupResource[]> {
    return this.call<GroupResource[]>('listgroups');
  }

  /** Everything in the history, without the hidden duplicates. */
  getHistory(): Promise<HistoryResource[]> {
    return this.call<HistoryResource[]>('history', [false]);
  }

  async pauseDownload(): Promise<void> {
    await this.call<boolean>('pausedownload');
  }

  async resumeDownload(): Promise<void> {
    await this.call<boolean>('resumedownload');
  }

  /**
   * Changes one download in the queue. False when NZBGet doesn't have it. The 0 is the old
   * "offset" argument, which NZBGet still accepts and which keeps the arguments unambiguous.
   */
  editQueue(command: EditCommand, id: number, argument = ''): Promise<boolean> {
    return this.call<boolean>('editqueue', [command, 0, argument, id]);
  }

  /**
   * The category names set up in NZBGet (Settings, Categories). `config` also holds NZBGet's
   * passwords, so only the names leave this method.
   */
  async getCategories(): Promise<string[]> {
    const config = await this.call<Array<{ Name: string; Value: string }>>('config');
    const names = config.filter((option) => CATEGORY_NAME.test(option.Name));
    return names.map((option) => option.Value.trim()).filter(Boolean);
  }
}

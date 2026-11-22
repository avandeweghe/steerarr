import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  NzbgetDeleteMode,
  NzbgetHistoryItem,
  NzbgetItemState,
  NzbgetOutcome,
  NzbgetQueue,
  NzbgetQueueItem,
  NzbgetStatus,
  Page,
  ServiceSummary,
} from '@steerarr/shared';
import { BadRequestError, NotFoundError } from '../../core/errors.js';
import type { EditCommand, NzbgetClient } from './client.js';
import type { GroupResource, HistoryResource, StatusResource } from './types.js';

const HISTORY_PAGE_SIZE = 50;

const idParams = z.object({ id: z.coerce.number().int().positive() });
const actionParams = idParams.extend({ action: z.enum(['pause', 'resume', 'top', 'bottom']) });
const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1) });
const categoryBody = z.object({ category: z.string().max(200) });
const deleteQuery = z.object({ mode: z.enum(['keepFiles', 'deleteFiles', 'noHistory']) });

const DELETE_COMMANDS: Record<NzbgetDeleteMode, EditCommand> = {
  keepFiles: 'GroupParkDelete',
  deleteFiles: 'GroupDelete',
  noHistory: 'GroupFinalDelete',
};

const COMMANDS: Record<z.infer<typeof actionParams>['action'], EditCommand> = {
  pause: 'GroupPause',
  resume: 'GroupResume',
  top: 'GroupMoveTop',
  bottom: 'GroupMoveBottom',
};

/** NZBGet's statuses while it's working on a finished download. */
const PROCESSING = new Set([
  'PP_QUEUED',
  'LOADING_PARS',
  'VERIFYING_SOURCES',
  'REPAIRING',
  'VERIFYING_REPAIRED',
  'RENAMING',
  'UNPACKING',
  'MOVING',
  'POST_UNPACK_RENAMING',
  'EXECUTING_SCRIPT',
  'PP_FINISHED',
  'QS_QUEUED',
  'QS_EXECUTING',
]);

/** Routes under /api/nzbget: the queue (with controls) and the history. */
export function nzbgetRoutes(getClient: () => NzbgetClient) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/queue', async (): Promise<NzbgetQueue> => {
      const client = getClient();
      const [status, groups] = await Promise.all([client.getStatus(), client.listGroups()]);
      return { status: toStatus(status), items: groups.map(toQueueItem) };
    });

    app.post('/queue/pause', async (_request, reply) => {
      await getClient().pauseDownload();
      return reply.status(204).send();
    });

    app.post('/queue/resume', async (_request, reply) => {
      await getClient().resumeDownload();
      return reply.status(204).send();
    });

    app.post('/queue/:id/:action', async (request, reply) => {
      const params = actionParams.safeParse(request.params);
      if (!params.success) {
        throw new BadRequestError('Send a download id and pause, resume, top or bottom.');
      }
      await edit(COMMANDS[params.data.action], params.data.id);
      return reply.status(204).send();
    });

    app.get('/categories', async (): Promise<string[]> => getClient().getCategories());

    // NZBGet's own "change category": also applies that category's settings (folder, scripts).
    app.put('/queue/:id/category', async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) throw new BadRequestError('The download id must be a positive number.');
      const body = categoryBody.safeParse(request.body);
      if (!body.success) {
        throw new BadRequestError('Send { "category": "<name>" }, or "" for none.');
      }
      const category = body.data.category.trim();
      if (category && !(await getClient().getCategories()).includes(category)) {
        throw new BadRequestError(`NZBGet has no category called "${category}".`);
      }
      await edit('GroupApplyCategory', params.data.id, category);
      return reply.status(204).send();
    });

    // Removes a download the way NZBGet's own Delete dialog asks for (see NzbgetDeleteMode).
    app.delete('/queue/:id', async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) throw new BadRequestError('The download id must be a positive number.');
      const query = deleteQuery.safeParse(request.query);
      if (!query.success) {
        throw new BadRequestError(
          'Say how to delete it: mode=keepFiles, deleteFiles or noHistory.',
        );
      }
      await edit(DELETE_COMMANDS[query.data.mode], params.data.id);
      return reply.status(204).send();
    });

    app.get('/history', async (request): Promise<Page<NzbgetHistoryItem>> => {
      const query = pageQuery.safeParse(request.query);
      if (!query.success) throw new BadRequestError('The page must be a number from 1.');
      const { page } = query.data;
      const history = await getClient().getHistory();
      history.sort((a, b) => b.HistoryTime - a.HistoryTime);
      const start = (page - 1) * HISTORY_PAGE_SIZE;
      return {
        page,
        pageSize: HISTORY_PAGE_SIZE,
        totalRecords: history.length,
        records: history.slice(start, start + HISTORY_PAGE_SIZE).map(toHistoryItem),
      };
    });

    app.get('/summary', async (): Promise<ServiceSummary> => {
      const client = getClient();
      const [version, status, groups] = await Promise.all([
        client.getVersion(),
        client.getStatus(),
        client.listGroups(),
      ]);
      const speed = status.DownloadPaused ? 'Paused' : formatRate(rateOf(status));
      return {
        version,
        facts: [`${plural(groups.length, 'download')} in the queue`, speed],
        issues: status.QuotaReached
          ? [{ level: 'warning', message: 'The download quota is reached.' }]
          : [],
      };
    });

    async function edit(command: EditCommand, id: number, argument = ''): Promise<void> {
      if (!(await getClient().editQueue(command, id, argument))) {
        throw new NotFoundError("That download isn't in NZBGet's queue any more.");
      }
    }
  };
}

/** Joins NZBGet's 32-bit halves of a size. */
function bytes(lo: number | undefined, hi: number | undefined): number {
  return (hi ?? 0) * 2 ** 32 + (lo ?? 0);
}

function rateOf(status: StatusResource): number {
  if (status.DownloadRateLo === undefined) return status.DownloadRate;
  return bytes(status.DownloadRateLo, status.DownloadRateHi);
}

function toStatus(status: StatusResource): NzbgetStatus {
  return {
    paused: status.DownloadPaused,
    downloadRate: rateOf(status),
    speedLimit: status.DownloadLimit,
    remaining: bytes(status.RemainingSizeLo, status.RemainingSizeHi),
  };
}

function toQueueItem(group: GroupResource): NzbgetQueueItem {
  const state = stateOf(group.Status);
  const processing = state === 'processing';
  const stage = group.PostInfoText || null;
  return {
    id: group.NZBID,
    name: group.NZBName,
    category: group.Category || null,
    size: bytes(group.FileSizeLo, group.FileSizeHi),
    remaining: bytes(group.RemainingSizeLo, group.RemainingSizeHi),
    state,
    status: group.Status,
    stage: processing ? stage : null,
    stageProgress: processing && group.PostStageProgress ? group.PostStageProgress / 1000 : null,
    priority: group.MaxPriority,
    health: group.Health / 1000,
  };
}

function stateOf(status: string): NzbgetItemState {
  if (status === 'DOWNLOADING' || status === 'FETCHING') return 'downloading';
  if (status === 'QUEUED') return 'queued';
  if (status === 'PAUSED') return 'paused';
  return PROCESSING.has(status) ? 'processing' : 'other';
}

const OUTCOMES: Record<string, NzbgetOutcome> = {
  SUCCESS: 'success',
  WARNING: 'warning',
  FAILURE: 'failure',
  DELETED: 'deleted',
};

function toHistoryItem(item: HistoryResource): NzbgetHistoryItem {
  const kind = item.Status.split('/')[0] ?? '';
  return {
    id: item.NZBID,
    name: item.Name,
    category: item.Category || null,
    size: bytes(item.FileSizeLo, item.FileSizeHi),
    time: new Date(item.HistoryTime * 1000).toISOString(),
    outcome: OUTCOMES[kind] ?? 'warning',
    status: item.Status,
    detail: historyDetail(item.Status),
  };
}

/** NZBGet's history statuses (NzbInfo::MakeTextStatus in v26), in plain words. */
const DETAILS: Record<string, string | null> = {
  'SUCCESS/ALL': null,
  'SUCCESS/HEALTH': null,
  'SUCCESS/UNPACK': 'Unpacked',
  'SUCCESS/PAR': 'Verified',
  'SUCCESS/GOOD': 'Marked as good',
  'SUCCESS/MARK': 'Marked as successful',
  'SUCCESS/HIDDEN': 'A hidden duplicate',
  'WARNING/HEALTH': 'Some articles are missing',
  'WARNING/SPACE': 'Not enough disk space to unpack',
  'WARNING/PASSWORD': 'Needs a password to unpack',
  'WARNING/DAMAGED': 'Damaged',
  'WARNING/REPAIRABLE': 'Repairable, but not repaired',
  'WARNING/SCRIPT': 'A post-processing script reported a problem',
  'FAILURE/PAR': 'Repair failed',
  'FAILURE/UNPACK': 'Unpacking failed',
  'FAILURE/MOVE': 'Moving the files failed',
  'FAILURE/HEALTH': 'Too many articles are missing',
  'FAILURE/SCAN': "The NZB couldn't be read",
  'FAILURE/BAD': 'Marked as bad',
  'FAILURE/HIDDEN': 'A hidden duplicate that failed',
  'FAILURE/INTERNAL_ERROR': 'NZBGet ran into an internal error',
  'DELETED/MANUAL': 'Removed by hand',
  'DELETED/DUPE': 'Removed as a duplicate',
  'DELETED/COPY': 'Removed: a copy is already in the queue',
  'DELETED/GOOD': 'Removed: a good copy was already downloaded',
};

/** The known ones from DETAILS; anything newer reads e.g. "Some reason" from SOME_REASON. */
function historyDetail(status: string): string | null {
  if (status in DETAILS) return DETAILS[status] ?? null;
  const reason = status.split('/')[1];
  if (!reason) return null;
  const words = reason.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "12.3 MiB/s", in binary units like the rest of the app. */
function formatRate(bytesPerSecond: number): string {
  const mib = bytesPerSecond / 1024 / 1024;
  if (mib >= 1) return `${mib.toFixed(1)} MiB/s`;
  return `${Math.round(bytesPerSecond / 1024)} KiB/s`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

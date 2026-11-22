import type { FastifyInstance } from 'fastify';
import type { SonarrHealthCheck, SonarrRootFolderSpace, SonarrStatusPage } from '@steerarr/shared';
import { diskOf, httpsUrl } from '../../core/arr-helpers.js';
import type { SonarrClient } from './client.js';

export { diskOf };
import type { DiskSpaceResource, HealthResource, RootFolderResource } from './types.js';

const LEVEL_ORDER: Record<SonarrHealthCheck['level'], number> = { error: 0, warning: 1, notice: 2 };

/** Sonarr's status page (health checks, disk space, uptime), under /api/sonarr. */
export async function statusRoutes(
  app: FastifyInstance,
  getClient: () => SonarrClient,
): Promise<void> {
  app.get('/status', async (): Promise<SonarrStatusPage> => {
    const client = getClient();
    const [status, health, folders, disks] = await Promise.all([
      client.getSystemStatus(),
      client.getHealth(),
      client.getRootFolders(),
      client.getDiskSpace(),
    ]);
    return {
      version: status.version,
      branch: status.branch,
      startTime: status.startTime,
      health: health
        .flatMap(toHealthCheck)
        .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]),
      rootFolders: folders.flatMap((folder) => toRootFolderSpace(folder, disks)),
    };
  });
}

/** "ok" checks are nothing to show. */
function toHealthCheck(resource: HealthResource): SonarrHealthCheck[] {
  if (resource.type === 'ok') return [];
  const check: SonarrHealthCheck = {
    source: resource.source || null,
    level: resource.type,
    message: resource.message || 'Sonarr reports a problem.',
    wikiUrl: httpsUrl(resource.wikiUrl),
  };
  return [check];
}

/** Root folders without a path can't be shown, so they're left out. */
function toRootFolderSpace(
  folder: RootFolderResource,
  disks: DiskSpaceResource[],
): SonarrRootFolderSpace[] {
  if (!folder.path) return [];
  const disk = diskOf(folder.path, disks);
  const space: SonarrRootFolderSpace = {
    path: folder.path,
    accessible: folder.accessible,
    freeSpace: folder.freeSpace ?? disk?.freeSpace ?? null,
    totalSpace: folder.totalSpace || disk?.totalSpace || null,
  };
  return [space];
}

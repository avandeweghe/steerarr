import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ArrSettings, ArrStatus } from '@steerarr/shared';
import { BadRequestError, NotConfiguredError } from './errors.js';
import type {
  ArrServiceClient,
  ServiceModule,
  ServicePreferences,
  SystemStatusResource,
} from './service-module.js';
import type { ArrServiceConfig, ArrSettingsStore } from './settings-store.js';
import type { Credentials } from './upstream-error.js';

const testBody = z.object({
  url: z.string(),
  apiKey: z.string().optional(),
  username: z.string().optional(),
});
const saveBody = testBody.extend({ force: z.boolean().optional() });

/**
 * Mounts a service at /api/<id>: its settings routes plus its own routes, which get a client
 * for the current settings on every request. Saving new settings takes effect immediately.
 *
 *   GET    /settings       { url, apiKeySaved, username }. Never the key or password itself.
 *   POST   /settings/test  Tests { url, apiKey? } and returns the service's status.
 *   PUT    /settings       Tests, then saves { url, apiKey?, force? }. `force` skips the test.
 *   DELETE /settings       Removes the saved settings.
 */
export async function registerArrService<Client extends ArrServiceClient>(
  app: FastifyInstance,
  service: ServiceModule<Client>,
  store: ArrSettingsStore,
): Promise<void> {
  const { id, name } = service;
  let cached: { config: ArrServiceConfig; client: Client } | null = null;

  const getClient = (): Client => {
    const config = store.get(id);
    if (!config) throw new NotConfiguredError(name);
    if (cached?.config !== config) cached = { config, client: service.createClient(config) };
    return cached.client;
  };

  const preferences: ServicePreferences = {
    defaultQualityProfileId: () => store.get(id)?.defaultQualityProfileId ?? null,
    setDefaultQualityProfileId: (profileId) => store.setDefaultQualityProfile(id, profileId),
  };

  const describe = (): ArrSettings => {
    const config = store.get(id);
    return {
      url: config?.url ?? null,
      apiKeySaved: config !== null,
      username: config?.username ?? null,
    };
  };

  await app.register(
    async (scope) => {
      scope.get('/settings', async (): Promise<ArrSettings> => describe());

      scope.post('/settings/test', async (request): Promise<ArrStatus> => {
        const body = parseBody(testBody, request.body);
        const candidate = resolveCandidate(service, store.get(id), body);
        return toArrStatus(await service.createClient(candidate).getSystemStatus());
      });

      scope.put('/settings', async (request): Promise<ArrSettings> => {
        const body = parseBody(saveBody, request.body);
        const candidate = resolveCandidate(service, store.get(id), body);
        if (!body.force) await service.createClient(candidate).getSystemStatus();
        await store.set(id, candidate);
        return describe();
      });

      scope.delete('/settings', async (_request, reply) => {
        await store.remove(id);
        return reply.status(204).send();
      });

      await scope.register(service.routes(getClient, preferences));
    },
    { prefix: `/api/${id}` },
  );
}

/** Maps a raw status resource to the DTO the app uses. */
export function toArrStatus(status: SystemStatusResource): ArrStatus {
  return {
    appName: status.appName,
    instanceName: status.instanceName,
    version: status.version,
    branch: status.branch,
    startTime: status.startTime,
  };
}

/**
 * Trims the address, checks it's http(s) and drops a trailing slash, so that
 * "https://sonarr.lan/" and "https://sonarr.lan" count as the same address.
 */
export function normalizeUrl(raw: string): string {
  const invalid = new BadRequestError('Enter the full address, starting with http:// or https://');
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw invalid;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw invalid;
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

/**
 * Works out which address and key (or username and password) to use. A blank key or password
 * means "keep the saved one", which is only allowed while the address is unchanged: otherwise
 * anyone could point Steerarr at their own server and have it send them the saved secret.
 */
function resolveCandidate(
  service: { name: string; credentials?: Credentials },
  saved: ArrServiceConfig | null,
  body: { url: string; apiKey?: string | undefined; username?: string | undefined },
): ArrServiceConfig {
  const url = normalizeUrl(body.url);
  const login = service.credentials === 'login';
  const username = body.username?.trim() ?? '';
  if (login && !username) throw new BadRequestError(`Enter ${service.name}'s username.`);
  // Keys never have spaces at the ends; a password might.
  const secret = (login ? body.apiKey : body.apiKey?.trim()) ?? '';
  const apiKey = secret || (saved?.url === url ? saved.apiKey : '');
  if (!apiKey) {
    const what = login ? 'password' : 'API key';
    throw new BadRequestError(
      saved
        ? `The address changed, so enter ${service.name}'s ${what} again.`
        : `Enter ${service.name}'s ${what}.`,
    );
  }
  return login ? { url, apiKey, username } : { url, apiKey };
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestError('Send the address and credentials as JSON.');
  return result.data;
}

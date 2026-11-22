import Fastify, { type FastifyInstance } from 'fastify';
import type { AboutResponse, HealthzResponse, ServicesResponse } from '@steerarr/shared';
import type { AppConfig } from './config.js';
import { AuthStore } from './core/auth-store.js';
import { registerAuth } from './core/auth.js';
import { registerSameOriginCheck } from './core/same-origin.js';
import { registerArrService } from './core/arr-service.js';
import { registerErrorHandling } from './core/errors.js';
import type { ServiceModule } from './core/service-module.js';
import { ArrSettingsStore } from './core/settings-store.js';
import { registerStaticFiles } from './core/static-files.js';
import { serviceModules } from './services/index.js';

export interface BuildAppOptions {
  config: AppConfig;
  /** Defaults to every registered module. Tests can pass their own. */
  modules?: readonly ServiceModule[];
  /** Defaults to the store in config.dataDir. */
  store?: ArrSettingsStore;
  /** Defaults to the login settings in config.dataDir. */
  auth?: AuthStore;
}

export async function buildApp({
  config,
  modules = serviceModules,
  store: givenStore,
  auth: givenAuth,
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    trustProxy: config.trustProxy,
  });
  const store =
    givenStore ?? ArrSettingsStore.inDataDir(config.dataDir, (message) => app.log.warn(message));
  const auth =
    givenAuth ?? AuthStore.inDataDir(config.dataDir, (message) => app.log.error(message));

  registerErrorHandling(app);
  // Before everything else, so their checks run ahead of every /api route.
  registerSameOriginCheck(app);
  registerAuth(app, auth);
  app.log.info(`Login: ${auth.state.kind}`);

  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    // Live data: never let the phone or a proxy serve a cached answer, unless the route chose
    // its own caching (e.g. versioned poster images).
    if (request.url.startsWith('/api/') && !reply.hasHeader('Cache-Control')) {
      reply.header('Cache-Control', 'no-store');
    }
  });

  if (config.staticDir) await registerStaticFiles(app, config.staticDir);

  // Liveness only. Deliberately doesn't call any service, so Swarm doesn't restart
  // Steerarr when Sonarr is down.
  app.get('/healthz', async (): Promise<HealthzResponse> => ({ status: 'ok' }));

  for (const service of modules) {
    await registerArrService(app, service, store);
    app.log.info(
      `${service.name}: ${store.isConfigured(service.id) ? 'set up' : 'not set up yet'}`,
    );
  }

  app.get('/api/services', async (): Promise<ServicesResponse> => ({
    services: modules.map(({ id, name }) => {
      const url = store.get(id)?.url ?? null;
      return { id, name, configured: url !== null, url };
    }),
  }));

  app.get('/api/about', async (): Promise<AboutResponse> => ({ commit: config.commit ?? null }));

  return app;
}

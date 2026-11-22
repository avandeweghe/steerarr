import { buildApp } from './app.js';
import { loadAppConfig } from './config.js';
import { ConfigError } from './env.js';

async function main(): Promise<void> {
  const config = loadAppConfig(process.env);
  const app = await buildApp({ config });

  // Node as PID 1 in a container ignores SIGTERM unless it's handled.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      app.log.info(`${signal} received, shutting down`);
      app.close().then(
        () => process.exit(0),
        (err: unknown) => {
          app.log.error({ err }, 'Error while shutting down');
          process.exit(1);
        },
      );
    });
  }

  await app.listen({ host: config.host, port: config.port });
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    console.error(`Configuration error: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

import { z } from 'zod';
import { ConfigError, readEnv, type Env } from './env.js';

export interface AppConfig {
  host: string;
  port: number;
  logLevel: LogLevel;
  /** Passed to Fastify's `trustProxy`: true/false, or a comma-separated list of IPs/CIDRs/names. */
  trustProxy: boolean | string;
  /** Folder where Steerarr keeps its own data, such as saved service settings. */
  dataDir: string;
  /** Built frontend to serve (the production image sets it). Unset in development. */
  staticDir: string | undefined;
  /** The commit the running image was built from (the image build sets it), if known. */
  commit: string | undefined;
}

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const schema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(6232),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  // Private ranges cover Caddy on the LAN and the Swarm ingress network.
  TRUST_PROXY: z.string().default('loopback,linklocal,uniquelocal'),
  DATA_DIR: z.string().default('/data'),
  STATIC_DIR: z.string().optional(),
  STEERARR_COMMIT: z.string().optional(),
});

/** Loads app-level settings. Blank variables count as unset. */
export function loadAppConfig(env: Env): AppConfig {
  const input = Object.fromEntries(
    Object.keys(schema.shape).map((key) => [key, readEnv(env, key)] as const),
  );
  const result = schema.safeParse(input);
  if (!result.success) throw new ConfigError(z.prettifyError(result.error));

  const data = result.data;
  return {
    host: data.HOST,
    port: data.PORT,
    logLevel: data.LOG_LEVEL,
    trustProxy: parseTrustProxy(data.TRUST_PROXY),
    dataDir: data.DATA_DIR,
    staticDir: data.STATIC_DIR,
    commit: data.STEERARR_COMMIT,
  };
}

function parseTrustProxy(value: string): boolean | string {
  const lower = value.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  return value;
}

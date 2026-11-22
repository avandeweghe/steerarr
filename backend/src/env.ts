/** Environment variables, e.g. `process.env`. Passed in explicitly so tests can supply their own. */
export type Env = Record<string, string | undefined>;

/** Invalid or incomplete configuration. Startup fails with this message. */
export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Returns the trimmed value of an env var, or undefined when it's unset or blank. */
export function readEnv(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

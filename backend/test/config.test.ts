import { describe, expect, it } from 'vitest';
import { loadAppConfig } from '../src/config.js';
import { ConfigError } from '../src/env.js';

describe('loadAppConfig', () => {
  it('uses defaults for an empty environment', () => {
    expect(loadAppConfig({})).toEqual({
      host: '0.0.0.0',
      port: 6232,
      logLevel: 'info',
      trustProxy: 'loopback,linklocal,uniquelocal',
      dataDir: '/data',
    });
  });

  it('treats blank values as unset', () => {
    expect(loadAppConfig({ PORT: '', LOG_LEVEL: ' ', DATA_DIR: '' })).toMatchObject({
      port: 6232,
      logLevel: 'info',
      dataDir: '/data',
    });
  });

  it('parses overrides', () => {
    const config = loadAppConfig({
      PORT: '9000',
      LOG_LEVEL: 'debug',
      TRUST_PROXY: 'false',
      DATA_DIR: '/srv/steerarr',
    });
    expect(config.port).toBe(9000);
    expect(config.logLevel).toBe('debug');
    expect(config.trustProxy).toBe(false);
    expect(config.dataDir).toBe('/srv/steerarr');
    expect(loadAppConfig({ TRUST_PROXY: 'TRUE' }).trustProxy).toBe(true);
    expect(loadAppConfig({ TRUST_PROXY: '10.0.0.1' }).trustProxy).toBe('10.0.0.1');
  });

  it('rejects invalid values', () => {
    expect(() => loadAppConfig({ PORT: 'abc' })).toThrow(ConfigError);
    expect(() => loadAppConfig({ PORT: '70000' })).toThrow(ConfigError);
    expect(() => loadAppConfig({ LOG_LEVEL: 'loud' })).toThrow(ConfigError);
  });
});

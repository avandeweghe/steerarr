import { describe, expect, it } from 'vitest';
import { readEnv } from '../src/env.js';

describe('readEnv', () => {
  it('trims values and treats blank as unset', () => {
    expect(readEnv({ A: '  x  ' }, 'A')).toBe('x');
    expect(readEnv({ A: '   ' }, 'A')).toBeUndefined();
    expect(readEnv({}, 'A')).toBeUndefined();
  });
});

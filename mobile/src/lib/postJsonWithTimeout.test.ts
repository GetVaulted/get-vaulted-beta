import { describe, expect, it } from 'vitest';
import { postJsonWithTimeout } from './postJsonWithTimeout';

describe('postJsonWithTimeout', () => {
  it('exports a function', () => {
    expect(typeof postJsonWithTimeout).toBe('function');
  });
});

import { describe, expect, it } from 'vitest';
import { formatLiveDurationHms } from './formatLiveDurationHms';

describe('formatLiveDurationHms', () => {
  it('formats elapsed live time', () => {
    const start = '2026-01-01T12:00:00.000Z';
    const now = Date.parse('2026-01-01T12:05:07.000Z');
    expect(formatLiveDurationHms(start, now)).toBe('0:05:07');
  });

  it('includes hours when needed', () => {
    const start = '2026-01-01T12:00:00.000Z';
    const now = Date.parse('2026-01-01T14:00:05.000Z');
    expect(formatLiveDurationHms(start, now)).toBe('2:00:05');
  });
});

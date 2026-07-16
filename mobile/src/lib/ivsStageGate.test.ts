import { describe, expect, it } from 'vitest';
import { runIvsStageSerialized } from './ivsStageGate';

describe('ivsStageGate', () => {
  it('runs stage tasks in order without overlap', async () => {
    const order: string[] = [];
    const slow = runIvsStageSerialized(async () => {
      order.push('slow-start');
      await new Promise((r) => setTimeout(r, 30));
      order.push('slow-end');
      return 'slow';
    });
    const fast = runIvsStageSerialized(async () => {
      order.push('fast');
      return 'fast';
    });

    await expect(Promise.all([slow, fast])).resolves.toEqual(['slow', 'fast']);
    expect(order).toEqual(['slow-start', 'slow-end', 'fast']);
  });
});

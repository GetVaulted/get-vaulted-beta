import { describe, expect, it, vi } from 'vitest';
import { logBidControl } from './bidControlLog';

describe('logBidControl', () => {
  it('logs bid control events', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logBidControl('press', { roomId: 'room-1' });
    expect(spy).toHaveBeenCalledWith('[bid control] press', { roomId: 'room-1' });
    spy.mockRestore();
  });
});

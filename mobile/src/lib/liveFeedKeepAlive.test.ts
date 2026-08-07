import { describe, expect, it } from 'vitest';
import {
  getLiveFeedKeepAliveRoomId,
  isLiveFeedKeepAlive,
  resetLiveFeedKeepAliveForTests,
  setLiveFeedKeepAlive,
} from './liveFeedKeepAlive';

describe('liveFeedKeepAlive', () => {
  it('tracks the kept-alive room id', () => {
    resetLiveFeedKeepAliveForTests();
    expect(isLiveFeedKeepAlive()).toBe(false);
    setLiveFeedKeepAlive('room_1');
    expect(getLiveFeedKeepAliveRoomId()).toBe('room_1');
    expect(isLiveFeedKeepAlive('room_1')).toBe(true);
    expect(isLiveFeedKeepAlive('room_2')).toBe(false);
    setLiveFeedKeepAlive(null);
    expect(isLiveFeedKeepAlive()).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  isLiveStagePipKeepAliveActive,
  resetLiveStagePipKeepAliveForTests,
  setLiveStagePipKeepAlive,
} from './liveStagePipKeepAlive';

describe('liveStagePipKeepAlive', () => {
  it('tracks Stage PiP keep-alive for AppState resume', () => {
    resetLiveStagePipKeepAliveForTests();
    expect(isLiveStagePipKeepAliveActive()).toBe(false);
    setLiveStagePipKeepAlive(true);
    expect(isLiveStagePipKeepAliveActive()).toBe(true);
    setLiveStagePipKeepAlive(false);
    expect(isLiveStagePipKeepAliveActive()).toBe(false);
  });
});

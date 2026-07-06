import { vi } from 'vitest';

export const Dimensions = {
  get: () => ({ width: 390, height: 844 }),
};

export const Platform = {
  OS: 'ios',
  Version: '17.0',
};

export const Alert = {
  alert: vi.fn(),
};

export const Share = {
  share: vi.fn(async () => ({ action: 'sharedAction' })),
};

import { describe, expect, it } from 'vitest';
import { profileDisplayInitial } from './profileAvatar';

describe('profileDisplayInitial', () => {
  it('uses first letter of display name', () => {
    expect(profileDisplayInitial('Jordan')).toBe('J');
  });

  it('strips @ from handles', () => {
    expect(profileDisplayInitial('@vaultseller')).toBe('V');
  });

  it('falls back through labels', () => {
    expect(profileDisplayInitial('', null, 'alpha')).toBe('A');
  });

  it('returns ? when empty', () => {
    expect(profileDisplayInitial('', null)).toBe('?');
  });
});

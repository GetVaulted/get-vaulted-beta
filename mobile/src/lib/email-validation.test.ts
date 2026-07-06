import { describe, expect, it } from 'vitest';
import { isValidEmailFormat } from './email-validation';

describe('isValidEmailFormat', () => {
  it('accepts well-formed emails', () => {
    expect(isValidEmailFormat('ankita@gmail.com')).toBe(true);
    expect(isValidEmailFormat('first.last+tag@sub.example.co')).toBe(true);
    expect(isValidEmailFormat('  spaced@example.com  ')).toBe(true);
  });

  it('rejects emails missing a TLD', () => {
    expect(isValidEmailFormat('ankita@gmail')).toBe(false);
  });

  it('rejects emails missing the @ symbol', () => {
    expect(isValidEmailFormat('ankitagmail.com')).toBe(false);
  });

  it('rejects emails with spaces', () => {
    expect(isValidEmailFormat('ankita @gmail.com')).toBe(false);
    expect(isValidEmailFormat('ankita@gmail .com')).toBe(false);
  });

  it('rejects empty or missing local/domain parts', () => {
    expect(isValidEmailFormat('')).toBe(false);
    expect(isValidEmailFormat('@gmail.com')).toBe(false);
    expect(isValidEmailFormat('ankita@')).toBe(false);
    expect(isValidEmailFormat('ankita@.com')).toBe(false);
  });
});

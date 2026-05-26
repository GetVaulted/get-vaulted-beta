import { describe, expect, it } from 'vitest';
import { WALLET_CARD_FIELD_PLACEHOLDERS, WALLET_CARD_FIELD_STYLE } from './walletCardFieldStyle';

describe('walletCardFieldStyle', () => {
  it('uses high-contrast readable card field colors', () => {
    expect(WALLET_CARD_FIELD_STYLE.backgroundColor).toBe('#f4f4f5');
    expect(WALLET_CARD_FIELD_STYLE.textColor).toBe('#18181b');
    expect(WALLET_CARD_FIELD_STYLE.borderWidth).toBeGreaterThanOrEqual(2);
    expect(WALLET_CARD_FIELD_PLACEHOLDERS.number).toContain('1234');
  });
});

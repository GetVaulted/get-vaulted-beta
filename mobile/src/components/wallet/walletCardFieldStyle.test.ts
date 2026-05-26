import { describe, expect, it } from 'vitest';
import {
  WALLET_CARD_FIELD_PLACEHOLDERS,
  WALLET_CARD_FIELD_STYLE,
  WALLET_CARD_FORM_HEIGHT,
  WALLET_CARD_FORM_STYLE,
} from './walletCardFieldStyle';

describe('walletCardFieldStyle', () => {
  it('uses high-contrast readable card field colors', () => {
    expect(WALLET_CARD_FIELD_STYLE.backgroundColor).toBe('#FFFFFF');
    expect(WALLET_CARD_FIELD_STYLE.textColor).toBe('#18181b');
    expect(WALLET_CARD_FIELD_STYLE.borderWidth).toBeGreaterThanOrEqual(1);
    expect(WALLET_CARD_FIELD_PLACEHOLDERS.number).toContain('1234');
  });

  it('uses multi-row CardForm sizing for manual fallback', () => {
    expect(WALLET_CARD_FORM_STYLE.fontSize).toBeGreaterThanOrEqual(16);
    expect(WALLET_CARD_FORM_HEIGHT).toBeGreaterThanOrEqual(200);
    expect(WALLET_CARD_FIELD_PLACEHOLDERS.postalCode).toContain('ZIP');
  });
});

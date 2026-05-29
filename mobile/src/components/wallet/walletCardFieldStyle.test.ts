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
    expect(WALLET_CARD_FIELD_STYLE.textColor).toBe('#111111');
    expect(WALLET_CARD_FIELD_STYLE.placeholderColor).toBe('#9CA3AF');
    expect(WALLET_CARD_FIELD_STYLE.borderColor).toBe('#D1D5DB');
    expect(WALLET_CARD_FIELD_STYLE.borderWidth).toBeGreaterThanOrEqual(1);
    expect(WALLET_CARD_FIELD_PLACEHOLDERS.number).toContain('1234');
  });

  it('uses dark input text on CardForm for light surfaces', () => {
    expect(WALLET_CARD_FORM_STYLE.textColor).toBe('#111111');
    expect(WALLET_CARD_FORM_STYLE.backgroundColor).toBe('#FFFFFF');
    expect(WALLET_CARD_FORM_STYLE.textErrorColor).toBe('#DC2626');
  });

  it('uses multi-row CardForm sizing for manual fallback', () => {
    expect(WALLET_CARD_FORM_STYLE.fontSize).toBeGreaterThanOrEqual(16);
    expect(WALLET_CARD_FORM_HEIGHT).toBeGreaterThanOrEqual(200);
    expect(WALLET_CARD_FIELD_PLACEHOLDERS.postalCode).toContain('ZIP');
  });
});

/** High-contrast Stripe card entry styling for wallet setup. */
export const WALLET_CARD_FIELD_STYLE = {
  backgroundColor: '#FFFFFF',
  textColor: '#18181b',
  placeholderColor: '#71717a',
  borderColor: '#D4D4D8',
  borderWidth: 1,
  borderRadius: 12,
  fontSize: 17,
  cursorColor: '#18181b',
} as const;

export const WALLET_CARD_FORM_STYLE = {
  backgroundColor: '#FFFFFF',
  textColor: '#18181b',
  placeholderColor: '#71717a',
  borderColor: '#D4D4D8',
  borderWidth: 1,
  borderRadius: 12,
  fontSize: 17,
  cursorColor: '#18181b',
  textErrorColor: '#DC2626',
} as const;

export const WALLET_CARD_FIELD_PLACEHOLDERS = {
  number: '1234 5678 9012 3456',
  expiration: 'MM / YY',
  cvc: 'CVC',
  postalCode: 'Billing ZIP',
} as const;

/** Native CardForm height — multi-row number, expiry/CVC, and ZIP. */
export const WALLET_CARD_FORM_HEIGHT = 248;

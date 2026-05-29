/** High-contrast Stripe card entry styling for wallet setup (light surface, dark text). */
export const WALLET_CARD_FIELD_STYLE = {
  backgroundColor: '#FFFFFF',
  textColor: '#111111',
  placeholderColor: '#9CA3AF',
  borderColor: '#D1D5DB',
  borderWidth: 1,
  borderRadius: 12,
  fontSize: 17,
  cursorColor: '#111111',
} as const;

export const WALLET_CARD_FORM_STYLE = {
  backgroundColor: '#FFFFFF',
  textColor: '#111111',
  placeholderColor: '#9CA3AF',
  borderColor: '#D1D5DB',
  borderWidth: 1,
  borderRadius: 12,
  fontSize: 17,
  cursorColor: '#111111',
  textErrorColor: '#DC2626',
} as const;

export const WALLET_CARD_FIELD_PLACEHOLDERS = {
  number: '1234 5678 9012 3456',
  expiration: 'MM / YY',
  cvc: 'CVC',
  postalCode: 'Billing ZIP',
} as const;

/** Native CardForm height — number, expiry/CVC, and billing ZIP rows. */
export const WALLET_CARD_FORM_HEIGHT = 220;

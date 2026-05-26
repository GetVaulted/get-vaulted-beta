/** High-contrast CardField styling for wallet setup (readable on dark sheets). */
export const WALLET_CARD_FIELD_STYLE = {
  backgroundColor: '#f4f4f5',
  textColor: '#18181b',
  placeholderColor: '#71717a',
  borderColor: '#d4af37',
  borderWidth: 2,
  borderRadius: 10,
  fontSize: 16,
  cursorColor: '#18181b',
} as const;

export const WALLET_CARD_FIELD_PLACEHOLDERS = {
  number: '1234 5678 9012 3456',
  expiration: 'MM/YY',
  cvc: 'CVC',
  postalCode: 'ZIP',
} as const;

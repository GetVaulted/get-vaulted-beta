export const REVIEW_QUICK_TAGS = [
  'Fast shipping',
  'Trusted seller',
  'Great packaging',
  'Easy trade',
  'Great communication',
  'Smooth deal',
  'Vault verified experience',
] as const;

export type ReviewQuickTag = (typeof REVIEW_QUICK_TAGS)[number];

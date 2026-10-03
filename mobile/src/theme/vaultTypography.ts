/**
 * Vault console type system — the three faces from the "Vault Console Redesign" plan
 * (Fraunces for display, Barlow Condensed for labels/eyebrows, Public Sans for body copy).
 *
 * Scoped the same way as `./vaultColors.ts`: use these font families only inside the
 * redesigned live-console component tree, not app-wide. Loaded via `useFonts` in `App.tsx`
 * from the local .ttf files in `assets/fonts/` (no network fetch at runtime, so nothing
 * silently falls back to the system font because a Google Fonts request failed).
 */
export const vaultFonts = {
  /** Fraunces SemiBold — item titles, prices, the "Vault Hit" hit-reveal headline. */
  display: 'Fraunces-SemiBold',
  /** Fraunces Medium — lighter display moments (e.g. secondary headings). */
  displayMedium: 'Fraunces-Medium',
  /** Barlow Condensed Bold — seller name, CTA/button labels, the leading-bidder line. */
  label: 'BarlowCondensed-Bold',
  /** Barlow Condensed SemiBold — eyebrows, chip text, lighter-weight labels. */
  labelSemibold: 'BarlowCondensed-SemiBold',
  /** Barlow Condensed ExtraBold — the auction timer and other high-urgency numerals. */
  labelExtraBold: 'BarlowCondensed-ExtraBold',
  /** Public Sans Regular — chat messages and other body copy. */
  body: 'PublicSans-Regular',
  /** Public Sans Medium — slightly emphasized body copy. */
  bodyMedium: 'PublicSans-Medium',
} as const;

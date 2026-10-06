/**
 * Vault console theme — scoped to the redesigned buyer live-show console only.
 *
 * Deliberately separate from `./colors.ts` (the app-wide `colors` object used
 * across every screen). Reusing/mutating that global object would restyle the
 * entire app's backgrounds and gold accents, not just the live console — see the
 * "Vault Console Redesign" plan for why this is scoped instead of global.
 *
 * Apply these only within the live-console component tree (VerticalLiveFeed and
 * its children: header, video overlay chrome, chat, ticket/bid card, quick-actions
 * dial, sold/hit-reveal celebration).
 */
export const vaultColors = {
  bg: '#14120F',
  surface: '#1E1B17',
  surfaceAlt: '#26221C',
  metal: '#4A4E55',
  metalSoft: '#6B6F76',
  hairline: '#33302A',
  ink: '#F3EEE3',
  inkMuted: '#9C9484',
  gold: '#CBA35C',
  goldBright: '#F4E3B6',
  goldDim: '#8A6A34',
  emerald: '#2F7A63',
  rust: '#D9714F',
  glassFill: 'rgba(20, 18, 15, 0.55)',
  glassFillStrong: 'rgba(20, 18, 15, 0.7)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
} as const;

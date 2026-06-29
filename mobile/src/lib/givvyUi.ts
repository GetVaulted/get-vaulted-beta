/** Shared Givvy chrome — seller quick pill + buyer side tab use the same tokens. */
export const GIVVY_UI = {
  icon: '#6ee7b7',
  label: '#a7f3d0',
  border: 'rgba(110,231,183,0.35)',
  borderStrong: 'rgba(110,231,183,0.45)',
  pillBg: 'rgba(0,0,0,0.55)',
  androidFill: 'rgba(24,24,27,0.88)',
  sideTabAndroidFill: 'rgba(24,24,27,0.78)',
  count: '#fafafa',
  countMuted: 'rgba(250,250,250,0.72)',
} as const;

/** Collapsed buyer side tab — tuned for iPhone 15-class widths; same on all devices. */
export const GIVVY_SIDE_TAB = {
  width: 66,
  minHeight: 86,
  titleSize: 10,
  titleLine: 12,
  iconSize: 17,
  countSize: 20,
  countLine: 22,
  entriesSize: 8,
  entriesLine: 10,
  innerGap: 3,
  padH: 8,
} as const;

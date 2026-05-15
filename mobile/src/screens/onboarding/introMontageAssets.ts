/**
 * Launch intro — cinematic montage (prefetched stills + selective grade overlays).
 * Overlays are atmosphere / broadcast / slab only — no fake auction numbers.
 */
import { Image } from 'react-native';

export const MONTAGE_URIS = [
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1400&q=82&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1614162692292-7a56fe755c90?w=1400&q=82&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1517649763962-0c62306601b7?w=1400&q=82&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1504450758481-733fbeb0a814?w=1400&q=82&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1575367474432-62064d877175?w=1400&q=82&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1519861530063-99ff5c85a011?w=1400&q=82&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1708983471447-931a5b164778?w=1400&q=82&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1471295253337-4c3ae1c0ecf9?w=1400&q=82&auto=format&fit=crop',
] as const;

/** Memorabilia beat — full-bleed flash over montage (helmet on display). */
export const HELMET_FLASH_URI =
  'https://images.unsplash.com/photo-1638378943379-f9c64b6612e4?w=1400&q=82&auto=format&fit=crop' as const;

export type MontageOverlay =
  | 'none'
  | 'slab'
  | 'chrome'
  | 'refractor'
  | 'watch'
  | 'sneaker'
  | 'stadium'
  | 'bids'
  | 'bid'
  | 'sold'
  | 'chat'
  | 'patch'
  | 'breaker'
  | 'stream'
  | 'live';

/** Eight beats — shine, prism, LIVE mark, slab frame, repeat for density without junk UI. */
export const BEAT_OVERLAYS: MontageOverlay[] = [
  'chrome',
  'refractor',
  'live',
  'slab',
  'stadium',
  'chrome',
  'refractor',
  'live',
];

export const BEAT_COUNT = BEAT_OVERLAYS.length;

export const MONTAGE_END_P = 0.6;
export const COLLAPSE_END_P = 0.7;
export const VIGNETTE_START_P = 0.58;
export const VIGNETTE_PEAK_P = 0.7;
export const VIGNETTE_END_P = 0.78;
export const LOGO_ENTER_P = 0.78;
export const LOGO_SETTLE_P = 0.93;

/** Longer runway = bigger build without cheap “clip spam”. */
export const INTRO_TOTAL_MS = 4800;

export async function prefetchIntroMontageAssets(maxWaitMs = 650): Promise<void> {
  const tasks = [
    ...MONTAGE_URIS.map((uri) => Image.prefetch(uri).catch(() => undefined)),
    Image.prefetch(HELMET_FLASH_URI).catch(() => undefined),
  ];
  await Promise.race([Promise.all(tasks), new Promise((r) => setTimeout(r, maxWaitMs))]);
}

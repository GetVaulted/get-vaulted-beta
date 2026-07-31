/** PYT / PYD spot presets for live queue items (mirrors web live-item-variant-presets). */

import {
  BOARD_PACK_LABELS,
  DEFAULT_LIVE_BOARD_PACK,
  NFL_TEAMS,
  boardPackTeamCount,
  findTeamByName,
  teamColorForAbbr,
  teamsForBoardPack,
  type LiveBoardPackId,
} from './liveBoardPacks';

export type { LiveBoardPackId } from './liveBoardPacks';
export {
  BOARD_PACK_LABELS,
  DEFAULT_LIVE_BOARD_PACK,
  LIVE_BOARD_PACKS,
  NFL_TEAMS,
  boardPackSupportsDivisions,
  boardPackTeamCount,
  parseLiveBoardPack,
} from './liveBoardPacks';

export type LiveBreakVariantDraft = {
  label: string;
  priceUsd: number;
  quantityInitial: number;
  sortOrder: number;
  color: string;
  isHot?: boolean;
  /** Present when editing an existing queued item. */
  id?: string;
  /** Sold spots stay visible but are not editable. */
  soldOut?: boolean;
  buyerUsername?: string | null;
};

export function liveBreakVariantIsSold(v: {
  quantityRemaining?: number | null;
  status?: string | null;
}): boolean {
  if (v.status === 'removed') return false;
  const qty = typeof v.quantityRemaining === 'number' ? v.quantityRemaining : null;
  return (qty != null && qty <= 0) || v.status === 'sold_out';
}

export function liveBreakVariantIsRemoved(v: { status?: string | null }): boolean {
  return v.status === 'removed';
}

export const NFL_DIVISIONS: { label: string; conference: 'AFC' | 'NFC' }[] = [
  { label: 'AFC East', conference: 'AFC' },
  { label: 'AFC North', conference: 'AFC' },
  { label: 'AFC South', conference: 'AFC' },
  { label: 'AFC West', conference: 'AFC' },
  { label: 'NFC East', conference: 'NFC' },
  { label: 'NFC North', conference: 'NFC' },
  { label: 'NFC South', conference: 'NFC' },
  { label: 'NFC West', conference: 'NFC' },
];

/** @deprecated Prefer BOARD_PACK_TEAM_COLORS.nfl via teamColorForAbbr */
export const NFL_TEAM_COLORS: Record<string, string> = {
  ARI: '#97233F',
  ATL: '#000000',
  BAL: '#24135F',
  BUF: '#00338D',
  CAR: '#0085CA',
  CHI: '#0B162A',
  CIN: '#FB4F14',
  CLE: '#311D00',
  DAL: '#002244',
  DEN: '#FB4F14',
  DET: '#0076B6',
  GB: '#203731',
  HOU: '#03202F',
  IND: '#002C5F',
  JAX: '#006778',
  KC: '#E31837',
  LAC: '#0080C6',
  LAR: '#003594',
  LV: '#000000',
  MIA: '#008E97',
  MIN: '#4F2683',
  NE: '#002244',
  NO: '#D3BC8D',
  NYG: '#0B2265',
  NYJ: '#125740',
  PHI: '#004C54',
  PIT: '#FFB612',
  SEA: '#002244',
  SF: '#AA0000',
  TB: '#D50A0A',
  TEN: '#0C2340',
  WAS: '#5A1414',
};

export const NFL_DIVISION_COLORS: Record<string, string> = {
  'AFC East': '#C83803',
  'AFC North': '#24135F',
  'AFC South': '#002C5F',
  'AFC West': '#E31837',
  'NFC East': '#0B2265',
  'NFC North': '#203731',
  'NFC South': '#D3BC8D',
  'NFC West': '#003594',
};

export function buildPytVariants(
  priceUsd: number,
  boardPack: LiveBoardPackId = DEFAULT_LIVE_BOARD_PACK,
): LiveBreakVariantDraft[] {
  return teamsForBoardPack(boardPack).map((team, sortOrder) => ({
    label: team.name,
    priceUsd,
    quantityInitial: 1,
    sortOrder,
    color: team.abbr,
  }));
}

export function buildPydVariants(priceUsd: number): LiveBreakVariantDraft[] {
  return NFL_DIVISIONS.map((division, sortOrder) => ({
    label: division.label,
    priceUsd,
    quantityInitial: 1,
    sortOrder,
    color: division.conference,
  }));
}

export function buildRandomTeamVariants(
  priceUsd: number,
  boardPack: LiveBoardPackId = DEFAULT_LIVE_BOARD_PACK,
): LiveBreakVariantDraft[] {
  return [
    {
      label: `Random ${BOARD_PACK_LABELS[boardPack]} Team`,
      priceUsd,
      quantityInitial: boardPackTeamCount(boardPack),
      sortOrder: 0,
      color: `${boardPack}_teams`,
    },
  ];
}

export function buildRandomDivisionVariants(priceUsd: number): LiveBreakVariantDraft[] {
  return [
    {
      label: 'Random NFL Division',
      priceUsd,
      quantityInitial: 8,
      sortOrder: 0,
      color: 'nfl_divisions',
    },
  ];
}

export function teamAbbrForVariant(label: string, color?: string | null, pack?: LiveBoardPackId | null): string | null {
  const raw = color?.trim();
  if (raw) {
    const lower = raw.toLowerCase();
    if (!lower.endsWith('_teams') && lower !== 'nfl_divisions') {
      return raw.toUpperCase();
    }
  }
  return findTeamByName(label, pack)?.abbr ?? null;
}

/** Compact division label for boards + reel pills (e.g. "AFC East" → "AFC E"). */
export function formatDivisionReelAbbr(label: string): string {
  const match = label.trim().match(/^(AFC|NFC)\s+(East|North|South|West)$/i);
  if (!match) return label.trim();
  return `${match[1]!.toUpperCase()} ${match[2]![0]!.toUpperCase()}`;
}

function divisionColorForLabelOrAbbr(label: string, abbr?: string | null): string | null {
  const trimmed = label.trim();
  const direct = NFL_DIVISION_COLORS[trimmed];
  if (direct) return direct;
  const abbrTrim = abbr?.trim();
  for (const division of NFL_DIVISIONS) {
    const divAbbr = formatDivisionReelAbbr(division.label);
    if (divAbbr === trimmed || (abbrTrim && divAbbr === abbrTrim)) {
      return NFL_DIVISION_COLORS[division.label] ?? null;
    }
  }
  return null;
}

/** Team/division brand color for vault drop reels and spot boards. */
export function segmentColorForLabel(label: string, abbr?: string | null, pack?: LiveBoardPackId | null): string {
  const divisionColor = divisionColorForLabelOrAbbr(label, abbr);
  if (divisionColor) return divisionColor;
  if (abbr?.trim()) {
    const teamColor = teamColorForAbbr(abbr, pack);
    if (teamColor) return teamColor;
  }
  const fromLabel = teamAbbrForVariant(label, null, pack);
  if (fromLabel) {
    const teamColor = teamColorForAbbr(fromLabel, pack);
    if (teamColor) return teamColor;
  }
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  const palette = ['#047857', '#059669', '#0d9488', '#065f46', '#134e4a', '#115e59', '#047857'];
  return palette[hash % palette.length]!;
}

/** Per-spot color key for random pool boards (team abbr or division conference). */
export function spotColorKeyForPoolLabel(
  label: string,
  salesFormat: 'variant_selection' | 'team_break' | 'player_selection',
  pack?: LiveBoardPackId | null,
): string | null {
  if (salesFormat === 'team_break') {
    return NFL_DIVISIONS.find((d) => d.label === label)?.conference ?? null;
  }
  if (salesFormat === 'player_selection') {
    return null;
  }
  return findTeamByName(label, pack)?.abbr ?? null;
}

export function spotAccentColor(label: string, color?: string | null, isDivision?: boolean): string {
  if (isDivision) {
    return divisionColorForLabelOrAbbr(label, color) ?? '#1e293b';
  }
  return segmentColorForLabel(label, color);
}

export function isLightSpotAccent(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62;
}

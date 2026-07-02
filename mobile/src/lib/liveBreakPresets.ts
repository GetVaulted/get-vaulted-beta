/** NFL PYT / PYD spot presets for live queue items (mirrors web live-item-variant-presets). */

export type LiveBreakVariantDraft = {
  label: string;
  priceUsd: number;
  quantityInitial: number;
  sortOrder: number;
  color: string;
  isHot?: boolean;
  /** Present when editing an existing queued item. */
  id?: string;
};

export const NFL_TEAMS: { abbr: string; name: string }[] = [
  { abbr: 'ARI', name: 'Cardinals' },
  { abbr: 'ATL', name: 'Falcons' },
  { abbr: 'BAL', name: 'Ravens' },
  { abbr: 'BUF', name: 'Bills' },
  { abbr: 'CAR', name: 'Panthers' },
  { abbr: 'CHI', name: 'Bears' },
  { abbr: 'CIN', name: 'Bengals' },
  { abbr: 'CLE', name: 'Browns' },
  { abbr: 'DAL', name: 'Cowboys' },
  { abbr: 'DEN', name: 'Broncos' },
  { abbr: 'DET', name: 'Lions' },
  { abbr: 'GB', name: 'Packers' },
  { abbr: 'HOU', name: 'Texans' },
  { abbr: 'IND', name: 'Colts' },
  { abbr: 'JAX', name: 'Jaguars' },
  { abbr: 'KC', name: 'Chiefs' },
  { abbr: 'LAC', name: 'Chargers' },
  { abbr: 'LAR', name: 'Rams' },
  { abbr: 'LV', name: 'Raiders' },
  { abbr: 'MIA', name: 'Dolphins' },
  { abbr: 'MIN', name: 'Vikings' },
  { abbr: 'NE', name: 'Patriots' },
  { abbr: 'NO', name: 'Saints' },
  { abbr: 'NYG', name: 'Giants' },
  { abbr: 'NYJ', name: 'Jets' },
  { abbr: 'PHI', name: 'Eagles' },
  { abbr: 'PIT', name: 'Steelers' },
  { abbr: 'SEA', name: 'Seahawks' },
  { abbr: 'SF', name: '49ers' },
  { abbr: 'TB', name: 'Buccaneers' },
  { abbr: 'TEN', name: 'Titans' },
  { abbr: 'WAS', name: 'Commanders' },
];

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

/** Official-style primary brand hex per NFL abbreviation. */
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

export function buildPytVariants(priceUsd: number): LiveBreakVariantDraft[] {
  return NFL_TEAMS.map((team, sortOrder) => ({
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

export function buildRandomTeamVariants(priceUsd: number): LiveBreakVariantDraft[] {
  return [
    {
      label: 'Random NFL Team',
      priceUsd,
      quantityInitial: 32,
      sortOrder: 0,
      color: 'nfl_teams',
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

export function teamAbbrForVariant(label: string, color?: string | null): string | null {
  const raw = color?.trim();
  if (raw) {
    const lower = raw.toLowerCase();
    if (lower !== 'nfl_teams' && lower !== 'nfl_divisions') {
      return raw.toUpperCase();
    }
  }
  const match = NFL_TEAMS.find((t) => t.name.toLowerCase() === label.trim().toLowerCase());
  return match?.abbr ?? null;
}

/** Per-spot color key for random pool boards (team abbr or division conference). */
export function spotColorKeyForPoolLabel(
  label: string,
  salesFormat: 'variant_selection' | 'team_break',
): string | null {
  if (salesFormat === 'team_break') {
    return NFL_DIVISIONS.find((d) => d.label === label)?.conference ?? null;
  }
  return NFL_TEAMS.find((t) => t.name.toLowerCase() === label.trim().toLowerCase())?.abbr ?? null;
}

export function spotAccentColor(label: string, color?: string | null, isDivision?: boolean): string {
  if (isDivision) {
    return NFL_DIVISION_COLORS[label] ?? '#1e293b';
  }
  const abbr = teamAbbrForVariant(label, color);
  if (abbr && NFL_TEAM_COLORS[abbr]) return NFL_TEAM_COLORS[abbr];
  return '#1e293b';
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

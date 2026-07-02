/** NFL team brand colors for premium reveal wheel segments. */

export const NFL_TEAM_COLORS: Record<string, string> = {
  ARI: "#97233F",
  ATL: "#000000",
  BAL: "#24135F",
  BUF: "#00338D",
  CAR: "#0085CA",
  CHI: "#0B162A",
  CIN: "#FB4F14",
  CLE: "#311D00",
  DAL: "#002244",
  DEN: "#FB4F14",
  DET: "#0076B6",
  GB: "#203731",
  HOU: "#03202F",
  IND: "#002C5F",
  JAX: "#006778",
  KC: "#E31837",
  LAC: "#0080C6",
  LAR: "#003594",
  LV: "#000000",
  MIA: "#008E97",
  MIN: "#4F2683",
  NE: "#002244",
  NO: "#D3BC8D",
  NYG: "#0B2265",
  NYJ: "#125740",
  PHI: "#004C54",
  PIT: "#FFB612",
  SEA: "#002244",
  SF: "#AA0000",
  TB: "#D50A0A",
  TEN: "#0C2340",
  WAS: "#5A1414",
};

export const NFL_DIVISION_COLORS: Record<string, string> = {
  "AFC East": "#C83803",
  "AFC North": "#24135F",
  "AFC South": "#002C5F",
  "AFC West": "#E31837",
  "NFC East": "#0B2265",
  "NFC North": "#203731",
  "NFC South": "#D3BC8D",
  "NFC West": "#003594",
};

export function segmentColorForLabel(label: string, abbr?: string | null): string {
  const trimmed = label.trim();
  const directDivision = NFL_DIVISION_COLORS[trimmed];
  if (directDivision) return directDivision;
  const abbrTrim = abbr?.trim();
  for (const [full, color] of Object.entries(NFL_DIVISION_COLORS)) {
    const divAbbr = formatDivisionReelAbbr(full);
    if (divAbbr === trimmed || (abbrTrim && divAbbr === abbrTrim)) return color;
  }
  if (abbrTrim) {
    const c = NFL_TEAM_COLORS[abbrTrim.toUpperCase()];
    if (c) return c;
  }
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  const palette = ["#047857", "#059669", "#0d9488", "#065f46", "#134e4a", "#115e59", "#047857"];
  return palette[hash % palette.length]!;
}

/** Compact division label for reel pills (e.g. "AFC East" → "AFC E"). */
export function formatDivisionReelAbbr(label: string): string {
  const match = label.trim().match(/^(AFC|NFC)\s+(East|North|South|West)$/i);
  if (!match) return label.trim();
  return `${match[1]!.toUpperCase()} ${match[2]![0]!.toUpperCase()}`;
}

export function isLightSpotAccent(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62;
}

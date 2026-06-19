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
  if (abbr?.trim()) {
    const c = NFL_TEAM_COLORS[abbr.trim().toUpperCase()];
    if (c) return c;
  }
  const div = NFL_DIVISION_COLORS[label.trim()];
  if (div) return div;
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  const palette = ["#047857", "#059669", "#0d9488", "#065f46", "#134e4a", "#115e59", "#047857"];
  return palette[hash % palette.length]!;
}

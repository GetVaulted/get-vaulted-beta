import type { TeamBoardLeagueKey } from "@/lib/team-board-sets";

/** Official-style primary brand hex per abbreviation (league-specific). */
export const TEAM_BOARD_PRIMARY_BG: Record<TeamBoardLeagueKey, Record<string, string>> = {
  nfl: {
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
    MISC: "#52525b",
  },
  nba: {
    ATL: "#E03A3E",
    BOS: "#007A33",
    BKN: "#000000",
    CHA: "#1D1160",
    CHI: "#CE1141",
    CLE: "#860038",
    DAL: "#00538C",
    DEN: "#0E2240",
    DET: "#C8102E",
    GS: "#1D428A",
    HOU: "#CE1141",
    IND: "#002D62",
    LAC: "#C8102E",
    LAL: "#552583",
    MEM: "#5D76A9",
    MIA: "#98002E",
    MIL: "#00471B",
    MIN: "#0C2340",
    NOP: "#0C2340",
    NYK: "#006BB6",
    OKC: "#007AC1",
    ORL: "#0077C0",
    PHI: "#006BB6",
    PHX: "#1D1160",
    POR: "#E03A3E",
    SAC: "#5A2D81",
    SA: "#000000",
    TOR: "#CE1141",
    UTA: "#002B5C",
    WSH: "#002B5C",
  },
  mlb: {
    ARI: "#A71930",
    ATL: "#CE1141",
    ATH: "#003831",
    BAL: "#DF4601",
    BOS: "#BD3039",
    CHC: "#0E3386",
    CWS: "#27251F",
    CIN: "#C6011F",
    CLE: "#00385D",
    COL: "#33006F",
    DET: "#0C2340",
    HOU: "#EB6E1F",
    KC: "#004687",
    LAA: "#BA0021",
    LAD: "#005A9C",
    MIA: "#00A3E0",
    MIL: "#12284B",
    MIN: "#002B5C",
    NYM: "#002D72",
    NYY: "#003087",
    PHI: "#E81828",
    PIT: "#FDB827",
    SD: "#2F241D",
    SF: "#FD5A1E",
    SEA: "#0C2C56",
    STL: "#C41E3A",
    TB: "#092C5C",
    TEX: "#003278",
    TOR: "#134A8E",
    WSH: "#AB0003",
  },
  nhl: {
    ANA: "#F47A38",
    BOS: "#FFB81C",
    BUF: "#002654",
    CGY: "#C8102E",
    CAR: "#CC0000",
    CHI: "#CF0A2C",
    COL: "#6F263D",
    CBJ: "#002654",
    DAL: "#006847",
    DET: "#CE1126",
    EDM: "#041E42",
    FLA: "#C8102E",
    LA: "#111111",
    MIN: "#154734",
    MTL: "#AF1E2D",
    NSH: "#FFB81C",
    NJ: "#CE1126",
    NYI: "#00539B",
    NYR: "#0038A8",
    OTT: "#C52032",
    PHI: "#F74902",
    PIT: "#000000",
    SJ: "#006D75",
    SEA: "#001628",
    STL: "#002F87",
    TB: "#002868",
    TOR: "#00205B",
    UTA: "#69B3E7",
    VAN: "#00205B",
    VGK: "#B4975A",
    WSH: "#C8102E",
    WPG: "#041E42",
  },
};

/** Secondary / accent hex for diagonal blend (league-specific). */
export const TEAM_BOARD_SECONDARY_BG: Record<TeamBoardLeagueKey, Record<string, string>> = {
  nfl: {
    ARI: "#000000",
    ATL: "#A71930",
    BAL: "#9E7C0C",
    BUF: "#C60C30",
    CAR: "#000000",
    CHI: "#C83803",
    CIN: "#000000",
    CLE: "#FF3C00",
    DAL: "#869397",
    DEN: "#002244",
    DET: "#B0B7BC",
    GB: "#FFB612",
    HOU: "#A71930",
    IND: "#A2AAAD",
    JAX: "#9F792C",
    KC: "#FFB81C",
    LAC: "#FFC20E",
    LAR: "#FFD100",
    LV: "#A5ACAF",
    MIA: "#FC4C02",
    MIN: "#FFC62F",
    NE: "#C60C30",
    NO: "#000000",
    NYG: "#A71930",
    NYJ: "#2C5234",
    PHI: "#A5ACAF",
    PIT: "#000000",
    SEA: "#69BE28",
    SF: "#B3995D",
    TB: "#34302B",
    TEN: "#4B92DB",
    WAS: "#FFB612",
    MISC: "#71717a",
  },
  nba: {
    ATL: "#000000",
    BOS: "#BA965C",
    BKN: "#707271",
    CHA: "#00788C",
    CHI: "#000000",
    CLE: "#041E42",
    DAL: "#B4975A",
    DEN: "#FEC524",
    DET: "#1D42BA",
    GS: "#FFC72C",
    HOU: "#000000",
    IND: "#FDBB30",
    LAC: "#1D428A",
    LAL: "#FDB927",
    MEM: "#12173F",
    MIA: "#000000",
    MIL: "#EEE1C6",
    MIN: "#236192",
    NOP: "#C8102E",
    NYK: "#F58426",
    OKC: "#EF3B24",
    ORL: "#C4CED4",
    PHI: "#ED174C",
    PHX: "#E56020",
    POR: "#000000",
    SAC: "#000000",
    SA: "#C4CED4",
    TOR: "#000000",
    UTA: "#F9A01B",
    WSH: "#E31837",
  },
  mlb: {
    ARI: "#000000",
    ATL: "#13274F",
    ATH: "#EFB21E",
    BAL: "#000000",
    BOS: "#0C2340",
    CHC: "#CC3433",
    CWS: "#C4CED4",
    CIN: "#000000",
    CLE: "#E31937",
    COL: "#C4CED4",
    DET: "#FA4610",
    HOU: "#002D62",
    KC: "#BD9B60",
    LAA: "#003263",
    LAD: "#EF3E42",
    MIA: "#000000",
    MIL: "#FFC52F",
    MIN: "#D31145",
    NYM: "#FF5910",
    NYY: "#E4002C",
    PHI: "#284898",
    PIT: "#000000",
    SD: "#FFC425",
    SF: "#000000",
    SEA: "#005C5C",
    STL: "#0C2340",
    TB: "#8FBCE6",
    TEX: "#C0111F",
    TOR: "#E8291C",
    WSH: "#142448",
  },
  nhl: {
    ANA: "#B9975B",
    BOS: "#000000",
    BUF: "#FCB514",
    CGY: "#F1BE48",
    CAR: "#000000",
    CHI: "#000000",
    COL: "#236192",
    CBJ: "#CE1126",
    DAL: "#8F8F8C",
    DET: "#FFFFFF",
    EDM: "#FF4C00",
    FLA: "#041E42",
    LA: "#A2AAAD",
    MIN: "#A6192E",
    MTL: "#192168",
    NSH: "#041E42",
    NJ: "#000000",
    NYI: "#F47D30",
    NYR: "#CE1126",
    OTT: "#C2912C",
    PHI: "#000000",
    PIT: "#FCB514",
    SJ: "#000000",
    SEA: "#99D9D9",
    STL: "#FCB514",
    TB: "#FFFFFF",
    TOR: "#FFFFFF",
    UTA: "#090909",
    VAN: "#00843D",
    VGK: "#333F42",
    WSH: "#041E42",
    WPG: "#004C97",
  },
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.trim().replace("#", "");
  if (h.length !== 6) return null;
  const n = Number.parseInt(h, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** WCAG-style relative luminance (sRGB). */
function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const R = lin(rgb.r);
  const G = lin(rgb.g);
  const B = lin(rgb.b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function textOnTeamPrimary(bgHex: string): { fg: string; sub: string } {
  const L = luminance(bgHex);
  if (L < 0.45) {
    return { fg: "#ffffff", sub: "rgba(255,255,255,0.88)" };
  }
  return { fg: "#0a0a0a", sub: "rgba(10,10,10,0.78)" };
}

function mixHex(a: string, b: string, t: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return a;
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  const r = m(ra.r, rb.r);
  const g = m(ra.g, rb.g);
  const bl = m(ra.b, rb.b);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const FALLBACK_TILE_BG = "#3f3f46";

export function teamBoardTileColors(
  league: TeamBoardLeagueKey,
  abbr: string,
): { primary: string; secondary: string; fg: string; sub: string } {
  const key = abbr.trim().toUpperCase();
  const primary = TEAM_BOARD_PRIMARY_BG[league][key] ?? FALLBACK_TILE_BG;
  let secondary = TEAM_BOARD_SECONDARY_BG[league][key];
  if (!secondary || secondary.toUpperCase() === primary.toUpperCase()) {
    secondary = mixHex(primary, "#ffffff", 0.22);
    if (luminance(secondary) > luminance(primary)) {
      secondary = mixHex(primary, "#000000", 0.35);
    }
  }
  const mid = mixHex(primary, secondary, 0.5);
  const { fg, sub } = textOnTeamPrimary(mid);
  return { primary, secondary, fg, sub };
}

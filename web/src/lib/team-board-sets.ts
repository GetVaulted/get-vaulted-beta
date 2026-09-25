export type TeamBoardLeagueKey = "nfl" | "nba" | "mlb" | "nhl";

export const TEAM_BOARD_LEAGUES: TeamBoardLeagueKey[] = ["nfl", "nba", "mlb", "nhl"];

export const TEAM_BOARD_LEAGUE_LABELS: Record<TeamBoardLeagueKey, string> = {
  nfl: "NFL",
  nba: "NBA",
  mlb: "MLB",
  nhl: "NHL",
};

/** Uppercase abbreviations shown on the team board overlay. */
export const TEAM_BOARD_SETS: Record<TeamBoardLeagueKey, readonly string[]> = {
  nfl: [
    "ARI",
    "ATL",
    "BAL",
    "BUF",
    "CAR",
    "CHI",
    "CIN",
    "CLE",
    "DAL",
    "DEN",
    "DET",
    "GB",
    "HOU",
    "IND",
    "JAX",
    "KC",
    "LAC",
    "LAR",
    "LV",
    "MIA",
    "MIN",
    "NE",
    "NO",
    "NYG",
    "NYJ",
    "PHI",
    "PIT",
    "SEA",
    "SF",
    "TB",
    "TEN",
    "WAS",
  ],
  nba: [
    "ATL",
    "BOS",
    "BKN",
    "CHA",
    "CHI",
    "CLE",
    "DAL",
    "DEN",
    "DET",
    "GS",
    "HOU",
    "IND",
    "LAC",
    "LAL",
    "MEM",
    "MIA",
    "MIL",
    "MIN",
    "NOP",
    "NYK",
    "OKC",
    "ORL",
    "PHI",
    "PHX",
    "POR",
    "SAC",
    "SA",
    "TOR",
    "UTA",
    "WSH",
  ],
  mlb: [
    "ARI",
    "ATL",
    "ATH",
    "BAL",
    "BOS",
    "CHC",
    "CWS",
    "CIN",
    "CLE",
    "COL",
    "DET",
    "HOU",
    "KC",
    "LAA",
    "LAD",
    "MIA",
    "MIL",
    "MIN",
    "NYM",
    "NYY",
    "PHI",
    "PIT",
    "SD",
    "SF",
    "SEA",
    "STL",
    "TB",
    "TEX",
    "TOR",
    "WSH",
  ],
  nhl: [
    "ANA",
    "BOS",
    "BUF",
    "CGY",
    "CAR",
    "CHI",
    "COL",
    "CBJ",
    "DAL",
    "DET",
    "EDM",
    "FLA",
    "LA",
    "MIN",
    "MTL",
    "NSH",
    "NJ",
    "NYI",
    "NYR",
    "OTT",
    "PHI",
    "PIT",
    "SJ",
    "SEA",
    "STL",
    "TB",
    "TOR",
    "UTA",
    "VAN",
    "VGK",
    "WSH",
    "WPG",
  ],
};

/** Mascot / common name under each abbreviation on the team board (league-specific — same abbr can differ by league). */
export const TEAM_BOARD_DISPLAY_NAMES: Record<TeamBoardLeagueKey, Record<string, string>> = {
  nfl: {
    ARI: "Cardinals",
    ATL: "Falcons",
    BAL: "Ravens",
    BUF: "Bills",
    CAR: "Panthers",
    CHI: "Bears",
    CIN: "Bengals",
    CLE: "Browns",
    DAL: "Cowboys",
    DEN: "Broncos",
    DET: "Lions",
    GB: "Packers",
    HOU: "Texans",
    IND: "Colts",
    JAX: "Jaguars",
    KC: "Chiefs",
    LAC: "Chargers",
    LAR: "Rams",
    LV: "Raiders",
    MIA: "Dolphins",
    MIN: "Vikings",
    NE: "Patriots",
    NO: "Saints",
    NYG: "Giants",
    NYJ: "Jets",
    PHI: "Eagles",
    PIT: "Steelers",
    SEA: "Seahawks",
    SF: "49ers",
    TB: "Buccaneers",
    TEN: "Titans",
    WAS: "Commanders",
    MISC: "Misc",
    NCAA: "NCAA",
  },
  nba: {
    ATL: "Hawks",
    BOS: "Celtics",
    BKN: "Nets",
    CHA: "Hornets",
    CHI: "Bulls",
    CLE: "Cavaliers",
    DAL: "Mavericks",
    DEN: "Nuggets",
    DET: "Pistons",
    GS: "Warriors",
    HOU: "Rockets",
    IND: "Pacers",
    LAC: "Clippers",
    LAL: "Lakers",
    MEM: "Grizzlies",
    MIA: "Heat",
    MIL: "Bucks",
    MIN: "Timberwolves",
    NOP: "Pelicans",
    NYK: "Knicks",
    OKC: "Thunder",
    ORL: "Magic",
    PHI: "76ers",
    PHX: "Suns",
    POR: "Trail Blazers",
    SAC: "Kings",
    SA: "Spurs",
    TOR: "Raptors",
    UTA: "Jazz",
    WSH: "Wizards",
  },
  mlb: {
    ARI: "Diamondbacks",
    ATL: "Braves",
    ATH: "Athletics",
    BAL: "Orioles",
    BOS: "Red Sox",
    CHC: "Cubs",
    CWS: "White Sox",
    CIN: "Reds",
    CLE: "Guardians",
    COL: "Rockies",
    DET: "Tigers",
    HOU: "Astros",
    KC: "Royals",
    LAA: "Angels",
    LAD: "Dodgers",
    MIA: "Marlins",
    MIL: "Brewers",
    MIN: "Twins",
    NYM: "Mets",
    NYY: "Yankees",
    PHI: "Phillies",
    PIT: "Pirates",
    SD: "Padres",
    SF: "Giants",
    SEA: "Mariners",
    STL: "Cardinals",
    TB: "Rays",
    TEX: "Rangers",
    TOR: "Blue Jays",
    WSH: "Nationals",
  },
  nhl: {
    ANA: "Ducks",
    BOS: "Bruins",
    BUF: "Sabres",
    CGY: "Flames",
    CAR: "Hurricanes",
    CHI: "Blackhawks",
    COL: "Avalanche",
    CBJ: "Blue Jackets",
    DAL: "Stars",
    DET: "Red Wings",
    EDM: "Oilers",
    FLA: "Panthers",
    LA: "Kings",
    MIN: "Wild",
    MTL: "Canadiens",
    NSH: "Predators",
    NJ: "Devils",
    NYI: "Islanders",
    NYR: "Rangers",
    OTT: "Senators",
    PHI: "Flyers",
    PIT: "Penguins",
    SJ: "Sharks",
    SEA: "Kraken",
    STL: "Blues",
    TB: "Lightning",
    TOR: "Maple Leafs",
    UTA: "Mammoth",
    VAN: "Canucks",
    VGK: "Golden Knights",
    WSH: "Capitals",
    WPG: "Jets",
  },
};

export function teamBoardDisplayName(league: TeamBoardLeagueKey, abbr: string): string {
  const key = abbr.trim().toUpperCase();
  return TEAM_BOARD_DISPLAY_NAMES[league][key] ?? abbr;
}

export function normalizeTeamAbbr(raw: string): string {
  return raw.trim().toUpperCase().slice(0, 6);
}

export function isValidTeamForLeague(
  league: string,
  abbr: string,
  opts?: { allowMisc?: boolean; allowNcaa?: boolean },
): boolean {
  if (league !== "nfl" && league !== "nba" && league !== "mlb" && league !== "nhl") return false;
  const a = normalizeTeamAbbr(abbr);
  if (opts?.allowMisc && league === "nfl" && a === "MISC") return true;
  if (opts?.allowNcaa && league === "nfl" && a === "NCAA") return true;
  return TEAM_BOARD_SETS[league].includes(a);
}

export function parseTeamBoardLeague(v: string): TeamBoardLeagueKey | null {
  if (v === "nfl" || v === "nba" || v === "mlb" || v === "nhl") return v;
  return null;
}

/** Table layout: NFL/NHL 8×4 (32 teams), NBA/MLB 6×5 (30 teams). */
export function teamBoardTableColumnCount(league: TeamBoardLeagueKey): 6 | 8 {
  return league === "nba" || league === "mlb" ? 6 : 8;
}

export function teamBoardSpotCount(league: TeamBoardLeagueKey): number {
  return TEAM_BOARD_SETS[league].length;
}

export function teamBoardLeagueKey(league: string): TeamBoardLeagueKey {
  const p = parseTeamBoardLeague(league);
  return p ?? "nba";
}

/** Resolve a PYT variant row to a board abbr (color stores abbr for presets). */
export function resolveTeamAbbrFromVariantLabel(
  league: TeamBoardLeagueKey,
  label: string,
  color?: string | null,
): string | null {
  const raw = color?.trim() ?? "";
  if (raw) {
    const lower = raw.toLowerCase();
    if (!lower.endsWith("_teams") && lower !== "nfl_divisions" && lower !== "player") {
      const fromColor = normalizeTeamAbbr(raw);
      if (fromColor === "MISC" || fromColor === "NCAA") return fromColor;
      if (TEAM_BOARD_SETS[league].includes(fromColor)) return fromColor;
    }
  }

  const needle = label.trim().toLowerCase();
  if (!needle) return null;
  const names = TEAM_BOARD_DISPLAY_NAMES[league];
  for (const [abbr, name] of Object.entries(names)) {
    const nameLower = name.toLowerCase();
    if (needle === nameLower || needle === abbr.toLowerCase()) return abbr;
    if (needle.endsWith(` ${nameLower}`) || needle.endsWith(nameLower)) return abbr;
  }
  return null;
}

export type TeamBoardItemVariantLite = {
  label: string;
  color?: string | null;
  status?: string | null;
};

/**
 * Team Board roster for the active lot.
 * Pick-your-team items with a custom subset use those teams; random / full packs / non-PYT keep the league set.
 */
export function teamBoardTeamsForActiveItem(opts: {
  league: TeamBoardLeagueKey;
  salesFormat?: string | null;
  variantAssignmentMode?: string | null;
  variants?: TeamBoardItemVariantLite[] | null;
  includeMisc?: boolean;
  includeNcaa?: boolean;
}): string[] {
  const base = TEAM_BOARD_SETS[opts.league];
  const appendExtras = (teams: string[]): string[] => {
    const out = [...teams];
    if (opts.includeMisc && opts.league === "nfl" && !out.includes("MISC")) out.push("MISC");
    if (opts.includeNcaa && opts.league === "nfl" && !out.includes("NCAA")) out.push("NCAA");
    return out;
  };

  if (opts.salesFormat !== "variant_selection" || opts.variantAssignmentMode === "random") {
    return appendExtras([...base]);
  }

  const variants = (opts.variants ?? []).filter((v) => v.status !== "removed");
  if (variants.length === 0) return appendExtras([...base]);

  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const v of variants) {
    const abbr = resolveTeamAbbrFromVariantLabel(opts.league, v.label, v.color);
    if (!abbr || seen.has(abbr)) continue;
    if (
      !isValidTeamForLeague(opts.league, abbr, {
        allowMisc: Boolean(opts.includeMisc),
        allowNcaa: Boolean(opts.includeNcaa),
      })
    ) {
      continue;
    }
    seen.add(abbr);
    resolved.push(abbr);
  }

  if (resolved.length === 0) return appendExtras([...base]);

  const coreResolved = resolved.filter((a) => a !== "MISC" && a !== "NCAA");
  if (coreResolved.length >= base.length) return appendExtras([...base]);

  const order = new Map(appendExtras([...base]).map((abbr, i) => [abbr, i]));
  const sorted = resolved.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
  return appendExtras(sorted);
}


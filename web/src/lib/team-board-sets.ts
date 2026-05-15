export type TeamBoardLeagueKey = "nfl" | "nba" | "mlb";

export const TEAM_BOARD_LEAGUES: TeamBoardLeagueKey[] = ["nfl", "nba", "mlb"];

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
  opts?: { allowMisc?: boolean },
): boolean {
  if (league !== "nfl" && league !== "nba" && league !== "mlb") return false;
  const a = normalizeTeamAbbr(abbr);
  if (opts?.allowMisc && league === "nfl" && a === "MISC") return true;
  return TEAM_BOARD_SETS[league].includes(a);
}

export function parseTeamBoardLeague(v: string): TeamBoardLeagueKey | null {
  if (v === "nfl" || v === "nba" || v === "mlb") return v;
  return null;
}

/** Table layout: NFL 8×4 (32 teams), NBA/MLB 6×5 (30 teams). */
export function teamBoardTableColumnCount(league: TeamBoardLeagueKey): 6 | 8 {
  return league === "nfl" ? 8 : 6;
}

export function teamBoardLeagueKey(league: string): TeamBoardLeagueKey {
  const p = parseTeamBoardLeague(league);
  return p ?? "nba";
}

/** Multi-league board packs for live PYT / random team spots (mirrors web team-board-sets). */

export type LiveBoardPackId = 'nfl' | 'nba' | 'mlb' | 'nhl';

export type LiveBoardTeam = { abbr: string; name: string };

export const LIVE_BOARD_PACKS: { id: LiveBoardPackId; label: string }[] = [
  { id: 'nfl', label: 'NFL' },
  { id: 'nba', label: 'NBA' },
  { id: 'mlb', label: 'MLB' },
  { id: 'nhl', label: 'NHL' },
];

export const DEFAULT_LIVE_BOARD_PACK: LiveBoardPackId = 'nfl';

export function parseLiveBoardPack(v: string | null | undefined): LiveBoardPackId {
  if (v === 'nba' || v === 'mlb' || v === 'nhl' || v === 'nfl') return v;
  return DEFAULT_LIVE_BOARD_PACK;
}

/** Divisions (PYD) are NFL-only. */
export function boardPackSupportsDivisions(pack: LiveBoardPackId): boolean {
  return pack === 'nfl';
}

export const NFL_TEAMS: LiveBoardTeam[] = [
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

export const NBA_TEAMS: LiveBoardTeam[] = [
  { abbr: 'ATL', name: 'Hawks' },
  { abbr: 'BOS', name: 'Celtics' },
  { abbr: 'BKN', name: 'Nets' },
  { abbr: 'CHA', name: 'Hornets' },
  { abbr: 'CHI', name: 'Bulls' },
  { abbr: 'CLE', name: 'Cavaliers' },
  { abbr: 'DAL', name: 'Mavericks' },
  { abbr: 'DEN', name: 'Nuggets' },
  { abbr: 'DET', name: 'Pistons' },
  { abbr: 'GS', name: 'Warriors' },
  { abbr: 'HOU', name: 'Rockets' },
  { abbr: 'IND', name: 'Pacers' },
  { abbr: 'LAC', name: 'Clippers' },
  { abbr: 'LAL', name: 'Lakers' },
  { abbr: 'MEM', name: 'Grizzlies' },
  { abbr: 'MIA', name: 'Heat' },
  { abbr: 'MIL', name: 'Bucks' },
  { abbr: 'MIN', name: 'Timberwolves' },
  { abbr: 'NOP', name: 'Pelicans' },
  { abbr: 'NYK', name: 'Knicks' },
  { abbr: 'OKC', name: 'Thunder' },
  { abbr: 'ORL', name: 'Magic' },
  { abbr: 'PHI', name: '76ers' },
  { abbr: 'PHX', name: 'Suns' },
  { abbr: 'POR', name: 'Trail Blazers' },
  { abbr: 'SAC', name: 'Kings' },
  { abbr: 'SA', name: 'Spurs' },
  { abbr: 'TOR', name: 'Raptors' },
  { abbr: 'UTA', name: 'Jazz' },
  { abbr: 'WSH', name: 'Wizards' },
];

export const MLB_TEAMS: LiveBoardTeam[] = [
  { abbr: 'ARI', name: 'Diamondbacks' },
  { abbr: 'ATL', name: 'Braves' },
  { abbr: 'ATH', name: 'Athletics' },
  { abbr: 'BAL', name: 'Orioles' },
  { abbr: 'BOS', name: 'Red Sox' },
  { abbr: 'CHC', name: 'Cubs' },
  { abbr: 'CWS', name: 'White Sox' },
  { abbr: 'CIN', name: 'Reds' },
  { abbr: 'CLE', name: 'Guardians' },
  { abbr: 'COL', name: 'Rockies' },
  { abbr: 'DET', name: 'Tigers' },
  { abbr: 'HOU', name: 'Astros' },
  { abbr: 'KC', name: 'Royals' },
  { abbr: 'LAA', name: 'Angels' },
  { abbr: 'LAD', name: 'Dodgers' },
  { abbr: 'MIA', name: 'Marlins' },
  { abbr: 'MIL', name: 'Brewers' },
  { abbr: 'MIN', name: 'Twins' },
  { abbr: 'NYM', name: 'Mets' },
  { abbr: 'NYY', name: 'Yankees' },
  { abbr: 'PHI', name: 'Phillies' },
  { abbr: 'PIT', name: 'Pirates' },
  { abbr: 'SD', name: 'Padres' },
  { abbr: 'SF', name: 'Giants' },
  { abbr: 'SEA', name: 'Mariners' },
  { abbr: 'STL', name: 'Cardinals' },
  { abbr: 'TB', name: 'Rays' },
  { abbr: 'TEX', name: 'Rangers' },
  { abbr: 'TOR', name: 'Blue Jays' },
  { abbr: 'WSH', name: 'Nationals' },
];

export const NHL_TEAMS: LiveBoardTeam[] = [
  { abbr: 'ANA', name: 'Ducks' },
  { abbr: 'BOS', name: 'Bruins' },
  { abbr: 'BUF', name: 'Sabres' },
  { abbr: 'CGY', name: 'Flames' },
  { abbr: 'CAR', name: 'Hurricanes' },
  { abbr: 'CHI', name: 'Blackhawks' },
  { abbr: 'COL', name: 'Avalanche' },
  { abbr: 'CBJ', name: 'Blue Jackets' },
  { abbr: 'DAL', name: 'Stars' },
  { abbr: 'DET', name: 'Red Wings' },
  { abbr: 'EDM', name: 'Oilers' },
  { abbr: 'FLA', name: 'Panthers' },
  { abbr: 'LA', name: 'Kings' },
  { abbr: 'MIN', name: 'Wild' },
  { abbr: 'MTL', name: 'Canadiens' },
  { abbr: 'NSH', name: 'Predators' },
  { abbr: 'NJ', name: 'Devils' },
  { abbr: 'NYI', name: 'Islanders' },
  { abbr: 'NYR', name: 'Rangers' },
  { abbr: 'OTT', name: 'Senators' },
  { abbr: 'PHI', name: 'Flyers' },
  { abbr: 'PIT', name: 'Penguins' },
  { abbr: 'SJ', name: 'Sharks' },
  { abbr: 'SEA', name: 'Kraken' },
  { abbr: 'STL', name: 'Blues' },
  { abbr: 'TB', name: 'Lightning' },
  { abbr: 'TOR', name: 'Maple Leafs' },
  { abbr: 'UTA', name: 'Mammoth' },
  { abbr: 'VAN', name: 'Canucks' },
  { abbr: 'VGK', name: 'Golden Knights' },
  { abbr: 'WSH', name: 'Capitals' },
  { abbr: 'WPG', name: 'Jets' },
];

export const BOARD_PACK_TEAMS: Record<LiveBoardPackId, LiveBoardTeam[]> = {
  nfl: NFL_TEAMS,
  nba: NBA_TEAMS,
  mlb: MLB_TEAMS,
  nhl: NHL_TEAMS,
};

export const BOARD_PACK_LABELS: Record<LiveBoardPackId, string> = {
  nfl: 'NFL',
  nba: 'NBA',
  mlb: 'MLB',
  nhl: 'NHL',
};

export function boardPackTeamCount(pack: LiveBoardPackId): number {
  return BOARD_PACK_TEAMS[pack].length;
}

export function teamsForBoardPack(pack: LiveBoardPackId): LiveBoardTeam[] {
  return BOARD_PACK_TEAMS[pack];
}

/** Official-style primary brand hex per abbreviation (league-specific). */
export const BOARD_PACK_TEAM_COLORS: Record<LiveBoardPackId, Record<string, string>> = {
  nfl: {
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
  },
  nba: {
    ATL: '#E03A3E',
    BOS: '#007A33',
    BKN: '#000000',
    CHA: '#1D1160',
    CHI: '#CE1141',
    CLE: '#860038',
    DAL: '#00538C',
    DEN: '#0E2240',
    DET: '#C8102E',
    GS: '#1D428A',
    HOU: '#CE1141',
    IND: '#002D62',
    LAC: '#C8102E',
    LAL: '#552583',
    MEM: '#5D76A9',
    MIA: '#98002E',
    MIL: '#00471B',
    MIN: '#0C2340',
    NOP: '#0C2340',
    NYK: '#006BB6',
    OKC: '#007AC1',
    ORL: '#0077C0',
    PHI: '#006BB6',
    PHX: '#1D1160',
    POR: '#E03A3E',
    SAC: '#5A2D81',
    SA: '#000000',
    TOR: '#CE1141',
    UTA: '#002B5C',
    WSH: '#002B5C',
  },
  mlb: {
    ARI: '#A71930',
    ATL: '#CE1141',
    ATH: '#003831',
    BAL: '#DF4601',
    BOS: '#BD3039',
    CHC: '#0E3386',
    CWS: '#27251F',
    CIN: '#C6011F',
    CLE: '#00385D',
    COL: '#33006F',
    DET: '#0C2340',
    HOU: '#EB6E1F',
    KC: '#004687',
    LAA: '#BA0021',
    LAD: '#005A9C',
    MIA: '#00A3E0',
    MIL: '#12284B',
    MIN: '#002B5C',
    NYM: '#002D72',
    NYY: '#003087',
    PHI: '#E81828',
    PIT: '#FDB827',
    SD: '#2F241D',
    SF: '#FD5A1E',
    SEA: '#0C2C56',
    STL: '#C41E3A',
    TB: '#092C5C',
    TEX: '#003278',
    TOR: '#134A8E',
    WSH: '#AB0003',
  },
  nhl: {
    ANA: '#F47A38',
    BOS: '#FFB81C',
    BUF: '#002654',
    CGY: '#C8102E',
    CAR: '#CC0000',
    CHI: '#CF0A2C',
    COL: '#6F263D',
    CBJ: '#002654',
    DAL: '#006847',
    DET: '#CE1126',
    EDM: '#041E42',
    FLA: '#C8102E',
    LA: '#111111',
    MIN: '#154734',
    MTL: '#AF1E2D',
    NSH: '#FFB81C',
    NJ: '#CE1126',
    NYI: '#00539B',
    NYR: '#0038A8',
    OTT: '#C52032',
    PHI: '#F74902',
    PIT: '#000000',
    SJ: '#006D75',
    SEA: '#001628',
    STL: '#002F87',
    TB: '#002868',
    TOR: '#00205B',
    UTA: '#69B3E7',
    VAN: '#00205B',
    VGK: '#B4975A',
    WSH: '#C8102E',
    WPG: '#041E42',
  },
};

export function teamColorForAbbr(abbr: string, pack?: LiveBoardPackId | null): string | null {
  const key = abbr.trim().toUpperCase();
  if (!key) return null;
  if (pack) return BOARD_PACK_TEAM_COLORS[pack][key] ?? null;
  for (const league of LIVE_BOARD_PACKS) {
    const color = BOARD_PACK_TEAM_COLORS[league.id][key];
    if (color) return color;
  }
  return null;
}

export function findTeamByName(label: string, pack?: LiveBoardPackId | null): LiveBoardTeam | null {
  const needle = label.trim().toLowerCase();
  if (!needle) return null;
  const packs = pack ? [pack] : (['nfl', 'nba', 'mlb', 'nhl'] as const);
  for (const id of packs) {
    const match = BOARD_PACK_TEAMS[id].find((t) => t.name.toLowerCase() === needle);
    if (match) return match;
  }
  return null;
}

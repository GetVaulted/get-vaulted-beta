/** US state / territory postal codes keyed by normalized name (uppercase, no punctuation). */
const US_STATE_NAME_TO_CODE: Record<string, string> = {
  ALABAMA: "AL",
  ALASKA: "AK",
  ARIZONA: "AZ",
  ARKANSAS: "AR",
  CALIFORNIA: "CA",
  COLORADO: "CO",
  CONNECTICUT: "CT",
  DELAWARE: "DE",
  FLORIDA: "FL",
  GEORGIA: "GA",
  HAWAII: "HI",
  IDAHO: "ID",
  ILLINOIS: "IL",
  INDIANA: "IN",
  IOWA: "IA",
  KANSAS: "KS",
  KENTUCKY: "KY",
  LOUISIANA: "LA",
  MAINE: "ME",
  MARYLAND: "MD",
  MASSACHUSETTS: "MA",
  MICHIGAN: "MI",
  MINNESOTA: "MN",
  MISSISSIPPI: "MS",
  MISSOURI: "MO",
  MONTANA: "MT",
  NEBRASKA: "NE",
  NEVADA: "NV",
  NEWHAMPSHIRE: "NH",
  NEWJERSEY: "NJ",
  NEWMEXICO: "NM",
  NEWYORK: "NY",
  NORTHCAROLINA: "NC",
  NORTHDAKOTA: "ND",
  OHIO: "OH",
  OKLAHOMA: "OK",
  OREGON: "OR",
  PENNSYLVANIA: "PA",
  RHODEISLAND: "RI",
  SOUTHCAROLINA: "SC",
  SOUTHDAKOTA: "SD",
  TENNESSEE: "TN",
  TEXAS: "TX",
  UTAH: "UT",
  VERMONT: "VT",
  VIRGINIA: "VA",
  WASHINGTON: "WA",
  WESTVIRGINIA: "WV",
  WISCONSIN: "WI",
  WYOMING: "WY",
  DISTRICTOFCOLUMBIA: "DC",
  WASHINGTONDC: "DC",
  PUERTORICO: "PR",
  GUAM: "GU",
  VIRGINISLANDS: "VI",
  AMERICANSAMOA: "AS",
  NORTHERNMARIANAISLANDS: "MP",
};

const VALID_US_STATE_CODES = new Set(Object.values(US_STATE_NAME_TO_CODE));

function normalizeStateLookupKey(state: string): string {
  return state.replace(/[^a-zA-Z]/g, "").toUpperCase();
}

/** Normalize a US state input to a 2-letter code when possible. */
export function normalizeUsStateCode(state: string | null | undefined): string | null {
  const s = (state ?? "").trim();
  if (!s) return null;

  const upper = s.toUpperCase();
  if (upper.length === 2) {
    return VALID_US_STATE_CODES.has(upper) ? upper : upper;
  }

  const byName = US_STATE_NAME_TO_CODE[normalizeStateLookupKey(s)];
  if (byName) return byName;

  return null;
}

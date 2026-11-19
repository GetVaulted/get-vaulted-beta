/**
 * Pure rules for spotting DMs that move a sale off the app (Zelle / Venmo / Cash App, fee dodging,
 * "I'll mark it down on the platform", phone-number swaps). No database access here so it unit-tests.
 */

export type OffAppLevel = "high" | "medium" | "low";

export type OffAppTag = "payment_app" | "fee_talk" | "sending_money" | "contact_swap" | "social_move";

export const OFF_APP_TAG_LABEL: Record<OffAppTag, string> = {
  payment_app: "Payment app",
  fee_talk: "Fee / platform talk",
  sending_money: "Money amount",
  contact_swap: "Phone number / text me",
  social_move: "Discord / social",
};

export const OFF_APP_LEVEL_LABEL: Record<OffAppLevel, string> = {
  high: "Likely off-app sale",
  medium: "Payment app mentioned",
  low: "Contact swap only",
};

const PAYMENT_APP =
  /\b(venmo|cash\s?app|cashapp|zelle|apple\s?cash|chime|crypto|bitcoin|money\s?order|western\s?union)\b|\bpaypal\b/i;
const CASHTAG = /(^|\s)\$[a-z][a-z0-9_]{3,}\b/i;

const FEE_TALK = [
  /\b(avoid|skip|save|dodge|without|no|cut)\s+(the\s+)?(app\s+|platform\s+|vaulted\s+)?fees?\b/i,
  /\baround\s+(the\s+)?(app|platform|fees?)\b/i,
  /\boff[\s-]?(the\s+)?(app|platform|site)\b/i,
  /\boutside\s+(of\s+)?(the\s+)?(app|platform|vaulted|site)\b/i,
  /\bfriends\s*(and|&)\s*family\b/i,
  /\bf\s?&\s?f\b|\bffp\b/i,
  /\b(mark|log|claim|record|enter)\b[^.]{0,30}\b(on|for|in)\s+(the\s+)?(platform|app)\b/i,
  /\bpay\s+(the\s+)?(commission|fees?)\b/i,
];

const MONEY_VERB =
  /\b(send|sent|sending|throw|pay|paid|owe|transfer|deposit)\b|\bover to you\b|\b(give|get)\s+me\s+(some\s+)?(money|cash)\b/i;
const AMOUNT = /\$\s?\d[\d,]*(\.\d{1,2})?|\b\d[\d,]*\s?(bucks|dollars)\b/gi;

const PHONE = /(?<!\d)(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/;
const CONTACT_PHRASE = /\b(text me|shoot me a (text|message)|my (cell|number|phone)|call me|give me a call)\b/i;
const SOCIAL = /\b(discord(\.gg)?|instagram|facebook|fb\s+group|whatsapp|telegram|snapchat|tiktok)\b|\big\b/i;

export type OffAppVerdict = {
  level: OffAppLevel;
  tags: OffAppTag[];
  amounts: string[];
};

const RANK: Record<OffAppLevel, number> = { low: 0, medium: 1, high: 2 };

export function worseLevel(a: OffAppLevel, b: OffAppLevel): OffAppLevel {
  return RANK[a] >= RANK[b] ? a : b;
}

/** Evaluate one message body. Returns null when nothing in it looks like moving a sale off the app. */
export function evaluateOffAppMessage(body: string | null | undefined): OffAppVerdict | null {
  const text = (body ?? "").trim();
  if (!text) return null;

  const tags: OffAppTag[] = [];
  const amounts = [...text.matchAll(AMOUNT)].map((m) => m[0].replace(/\s+/g, ""));

  const paymentApp = PAYMENT_APP.test(text) || CASHTAG.test(text);
  const feeTalk = FEE_TALK.some((re) => re.test(text));
  const sendingMoney =
    (amounts.length > 0 && (MONEY_VERB.test(text) || paymentApp)) || (paymentApp && MONEY_VERB.test(text)) ||
    /\b(throw|send|give)\s+me\s+(some\s+)?(money|cash)\b/i.test(text);
  const contact = PHONE.test(text) || CONTACT_PHRASE.test(text);
  const social = SOCIAL.test(text);

  if (paymentApp) tags.push("payment_app");
  if (feeTalk) tags.push("fee_talk");
  if (sendingMoney) tags.push("sending_money");
  if (contact) tags.push("contact_swap");
  if (social) tags.push("social_move");
  if (tags.length === 0) return null;

  let level: OffAppLevel = "low";
  if (feeTalk || (paymentApp && (sendingMoney || amounts.length > 0))) level = "high";
  else if (paymentApp || sendingMoney) level = "medium";
  else if (!contact && !social) return null;

  return { level, tags, amounts: [...new Set(amounts)] };
}

/** Whole-thread level: the worst message wins. */
export function threadLevel(levels: OffAppLevel[]): OffAppLevel {
  return levels.reduce<OffAppLevel>((acc, l) => worseLevel(acc, l), "low");
}

/** Window of message indices around each flagged one (±radius), merged and sorted, for showing context. */
export function contextIndices(total: number, flagged: number[], radius = 2): number[] {
  const keep = new Set<number>();
  for (const i of flagged) {
    for (let j = Math.max(0, i - radius); j <= Math.min(total - 1, i + radius); j++) keep.add(j);
  }
  return [...keep].sort((a, b) => a - b);
}

export const OFF_APP_ORDER_WINDOW_BEFORE_DAYS = 2;
export const OFF_APP_ORDER_WINDOW_AFTER_DAYS = 4;

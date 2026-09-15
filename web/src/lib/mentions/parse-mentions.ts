/** Matches stored usernames: @alice, @vault_seller (3–20 chars). */
const MENTION_BODY_PATTERN = /@([a-z0-9_]{3,20})(?![a-z0-9_])/gi;

/** Active @-query while typing (partial username allowed). */
const MENTION_QUERY_PATTERN = /^[a-z0-9_]{0,20}$/;

export type ActiveMentionQuery = {
  query: string;
  start: number;
  end: number;
};

export function parseMentionUsernames(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = new RegExp(MENTION_BODY_PATTERN.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const at = match.index;
    const prev = at > 0 ? body[at - 1] : " ";
    if (prev && !/[\s([{]/.test(prev)) continue;
    const username = match[1].toLowerCase();
    if (!seen.has(username)) {
      seen.add(username);
      out.push(username);
    }
  }
  return out;
}

export function getActiveMentionQuery(text: string, cursor: number): ActiveMentionQuery | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const before = text.slice(0, safeCursor);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  const prev = at > 0 ? before[at - 1] : " ";
  if (prev && !/[\s([{]/.test(prev)) return null;
  const query = before.slice(at + 1).toLowerCase();
  if (!MENTION_QUERY_PATTERN.test(query)) return null;
  if (/\s/.test(query)) return null;
  return { query, start: at, end: safeCursor };
}

export function insertMentionAtQuery(
  text: string,
  active: ActiveMentionQuery,
  username: string,
): { text: string; cursor: number } {
  const insert = `@${username} `;
  const next = text.slice(0, active.start) + insert + text.slice(active.end);
  return { text: next, cursor: active.start + insert.length };
}

export type MentionTextSegment =
  | { type: "text"; value: string }
  | { type: "mention"; username: string; userId?: string };

/** Split message body into plain text and @mention segments for rendering. */
export function segmentMessageWithMentions(body: string, mentions: { userId: string; username: string }[]): MentionTextSegment[] {
  const byUsername = new Map(mentions.map((m) => [m.username.toLowerCase(), m]));
  const segments: MentionTextSegment[] = [];
  const re = new RegExp(MENTION_BODY_PATTERN.source, "gi");
  let last = 0;
  let match: RegExpExecArray | null;

  const pushText = (value: string) => {
    if (!value) return;
    const prev = segments[segments.length - 1];
    if (prev?.type === "text") {
      prev.value += value;
      return;
    }
    segments.push({ type: "text", value });
  };

  while ((match = re.exec(body)) !== null) {
    const at = match.index;
    const prev = at > 0 ? body[at - 1] : " ";
    if (prev && !/[\s([{]/.test(prev)) continue;
    if (match.index > last) {
      pushText(body.slice(last, match.index));
    }
    const username = match[1];
    const resolved = byUsername.get(username.toLowerCase());
    // Only treat resolved @handles as tags — unknown / self (never persisted) stay plain text.
    if (resolved) {
      segments.push({
        type: "mention",
        username: resolved.username,
        userId: resolved.userId,
      });
    } else {
      pushText(match[0]);
    }
    last = match.index + match[0].length;
  }
  if (last < body.length) {
    pushText(body.slice(last));
  }
  return segments.length ? segments : [{ type: "text", value: body }];
}

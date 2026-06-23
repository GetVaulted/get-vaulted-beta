export function appendMentionToDraft(draft: string, username: string): string {
  const handle = username.replace(/^@/, "").trim();
  if (!handle) return draft;
  const prefix = draft.length > 0 && !/\s$/.test(draft) ? `${draft} ` : draft;
  return `${prefix}@${handle} `;
}

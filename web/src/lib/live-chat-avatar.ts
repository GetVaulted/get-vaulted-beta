/** First letter of username for chat avatar fallback. */
export function liveChatUsernameInitial(username: string | null | undefined): string {
  const trimmed = username?.trim();
  if (!trimmed || trimmed === "System") return "?";
  return trimmed.charAt(0).toUpperCase();
}

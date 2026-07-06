/** Brand colors (inline for email clients). */
export const RESEND_EMAIL_BRAND = {
  bg: "#0a0a0d",
  card: "#111116",
  border: "rgba(255,255,255,0.08)",
  gold: "#d4af37",
  goldDim: "#a68b2d",
  text: "#fafafa",
  muted: "#a1a1aa",
} as const;

export function escapeResendHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

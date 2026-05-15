/**
 * Dev / QA panels (Trade Center, etc.). Off by default in production and in local dev
 * unless EXPO_PUBLIC_ENABLE_DEV_TOOLS is 1 or true.
 */
export function areDevToolsEnabled(): boolean {
  const v = process.env.EXPO_PUBLIC_ENABLE_DEV_TOOLS?.trim();
  return v === '1' || v === 'true';
}

export function getTradeDemoPartnerUserId(): string | null {
  const v = process.env.EXPO_PUBLIC_TRADE_DEMO_PARTNER_USER_ID?.trim();
  return v || null;
}

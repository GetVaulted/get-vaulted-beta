/**
 * Central env validation for Netlify functions (no hardcoded secrets).
 */

export type ShipEnv = {
  shippoToken: string | undefined;
  shippoWebhookSecret: string | undefined;
};

export type AwsIvsEnv = {
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
  region: string;
  defaultLatencyMode: string;
  defaultChannelType: string;
};

export type SupabaseEnv = {
  url: string | undefined;
  anonKey: string | undefined;
  serviceRoleKey: string | undefined;
};

export function readSupabaseEnv(): SupabaseEnv {
  return {
    url:
      process.env.SUPABASE_URL ??
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      process.env.EXPO_PUBLIC_SUPABASE_URL,
    anonKey:
      process.env.SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function readShippoEnv(): ShipEnv {
  return {
    shippoToken: process.env.SHIPPO_API_TOKEN,
    shippoWebhookSecret: process.env.SHIPPO_WEBHOOK_SECRET,
  };
}

export function readAwsIvsEnv(): AwsIvsEnv {
  return {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION ?? 'us-east-1',
    defaultLatencyMode: process.env.AWS_IVS_DEFAULT_LATENCY_MODE ?? 'LOW',
    defaultChannelType: process.env.AWS_IVS_DEFAULT_TYPE ?? 'STANDARD',
  };
}

export function requireSupabaseService(): { url: string; serviceKey: string } | { error: string } {
  const { url, serviceRoleKey } = readSupabaseEnv();
  if (!url || !serviceRoleKey) {
    return { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' };
  }
  return { url, serviceKey: serviceRoleKey };
}

export function requireShippoToken(): string | { error: string } {
  const t = readShippoEnv().shippoToken;
  if (!t?.trim()) {
    return { error: 'Missing SHIPPO_API_TOKEN (set in Netlify to enable label purchase).' };
  }
  return t;
}

export function requireAwsIvsCreds():
  | { accessKeyId: string; secretAccessKey: string; region: string; defaultLatencyMode: string; defaultChannelType: string }
  | { error: string } {
  const e = readAwsIvsEnv();
  if (!e.accessKeyId?.trim() || !e.secretAccessKey?.trim()) {
    return { error: 'Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY for IVS.' };
  }
  return {
    accessKeyId: e.accessKeyId,
    secretAccessKey: e.secretAccessKey,
    region: e.region,
    defaultLatencyMode: e.defaultLatencyMode,
    defaultChannelType: e.defaultChannelType,
  };
}

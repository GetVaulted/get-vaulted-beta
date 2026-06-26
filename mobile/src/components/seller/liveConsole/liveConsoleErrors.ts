import { LiveHostApiError } from '../../../api/liveHostRepository';
import { areDevToolsEnabled } from '../../../lib/devTools';

const NETWORK_PATTERNS = [
  /getaddrinfo/i,
  /enotfound/i,
  /econnrefused/i,
  /econnreset/i,
  /etimedout/i,
  /network request failed/i,
  /failed to fetch/i,
  /socket hang up/i,
  /dns/i,
  /ivs/i,
  /amazonaws/i,
  /prisma/i,
  /stripe/i,
];

const STATUS_UNAVAILABLE = /503|live.?coming.?soon|live_coming_soon/i;

export type SanitizedLiveError = {
  userMessage: string;
  devDetail: string | null;
  isNetwork: boolean;
};

export function sanitizeLiveError(raw: unknown, context?: 'stream' | 'room' | 'console'): SanitizedLiveError {
  const text =
    raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : 'Something went wrong.';
  const apiMeta =
    raw instanceof LiveHostApiError
      ? [
          `${raw.endpoint} → HTTP ${raw.status}${raw.code ? ` (${raw.code})` : ''}`,
          raw.detail,
          raw.hint,
        ]
          .filter(Boolean)
          .join(' · ')
      : null;
  const devDetail = areDevToolsEnabled() ? [text, apiMeta].filter(Boolean).join(' · ') : null;

  if (STATUS_UNAVAILABLE.test(text)) {
    return {
      userMessage: 'Broadcast service temporarily unavailable.',
      devDetail,
      isNetwork: true,
    };
  }

  const isNetwork = NETWORK_PATTERNS.some((p) => p.test(text));
  if (isNetwork || text.length > 120) {
    if (context === 'stream') {
      return {
        userMessage: 'Unable to connect to broadcast network.',
        devDetail,
        isNetwork: true,
      };
    }
    return {
      userMessage: 'Unable to reach the vault right now. Check your connection and try again.',
      devDetail,
      isNetwork: true,
    };
  }

  if (/invalid or expired session/i.test(text)) {
    return {
      userMessage: 'Your session expired. Sign out and sign back in, then try again.',
      devDetail,
      isNetwork: false,
    };
  }

  if (/sign in|unauthorized|401/i.test(text)) {
    return { userMessage: 'Sign in to continue hosting.', devDetail, isNetwork: false };
  }

  if (/not found|404/i.test(text)) {
    return { userMessage: 'This vault event could not be found.', devDetail, isNetwork: false };
  }

  if (/\b500\b/.test(text) && /max clients|connection pool|timed out|ECONNRESET|too many connections/i.test(text)) {
    return {
      userMessage: 'Vault server is busy reconnecting. Wait a moment and tap Retry.',
      devDetail,
      isNetwork: true,
    };
  }

  if (
    context === 'console' &&
    (/host console|HOST_CONSOLE_FAILED|Could not load host console|DATABASE_SCHEMA_OUT_OF_DATE|request failed \(50[03]\)/i.test(
      text,
    ) ||
      /database schema is out of date|prisma migrate deploy/i.test(text))
  ) {
    return {
      userMessage: 'Vault sync hit a server error. Showing your last synced queue.',
      devDetail,
      isNetwork: false,
    };
  }

  if (
    context === 'room' &&
    (/\b500\b/.test(text) ||
      /LIVE_ROOM_GET_FAILED|HOST_CONSOLE_FAILED|host-console|host console|DATABASE_SCHEMA_OUT_OF_DATE|database schema is out of date/i.test(
        text,
      ))
  ) {
    return {
      userMessage: 'Could not load this vault event from the server. Try again in a moment.',
      devDetail,
      isNetwork: false,
    };
  }

  return { userMessage: text, devDetail, isNetwork: false };
}

export function streamCheckingMessage(): string {
  return 'Checking stream connection…';
}

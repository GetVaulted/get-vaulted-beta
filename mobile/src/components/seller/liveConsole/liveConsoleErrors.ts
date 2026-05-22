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
  const devDetail = areDevToolsEnabled() ? text : null;

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

  if (/sign in|unauthorized|401/i.test(text)) {
    return { userMessage: 'Sign in to continue hosting.', devDetail, isNetwork: false };
  }

  if (/not found|404/i.test(text)) {
    return { userMessage: 'This vault event could not be found.', devDetail, isNetwork: false };
  }

  if (/host console|500|HOST_CONSOLE_FAILED/i.test(text)) {
    return {
      userMessage: 'Vault sync hit a server error. Showing your last synced queue.',
      devDetail,
      isNetwork: false,
    };
  }

  return { userMessage: text, devDetail, isNetwork: false };
}

export function streamCheckingMessage(): string {
  return 'Checking stream connection…';
}

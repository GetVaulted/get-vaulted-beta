export type BroadcastStatusTone = 'preparing' | 'live' | 'unstable' | 'checking';

export type BroadcastStatus = {
  tone: BroadcastStatusTone;
  label: string;
};

export function resolveBroadcastStatus(args: {
  streamHealth?: string | null;
  checking?: boolean;
  lastIvsError?: string | null;
}): BroadcastStatus {
  if (args.checking) {
    return { tone: 'checking', label: 'Checking stream connection…' };
  }

  const h = (args.streamHealth ?? '').toLowerCase();
  const err = args.lastIvsError?.trim();

  if (h === 'live') {
    return { tone: 'live', label: 'Broadcast live' };
  }

  if (h === 'connecting') {
    return { tone: 'preparing', label: 'Preparing broadcast' };
  }

  if (h === 'offline' && err) {
    return { tone: 'unstable', label: 'Connection unstable' };
  }

  if (h === 'ended') {
    return { tone: 'preparing', label: 'Broadcast ended' };
  }

  return { tone: 'preparing', label: 'Preparing broadcast' };
}

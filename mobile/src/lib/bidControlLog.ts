export type BidControlEvent = 'press' | 'hold' | 'commit' | 'reset' | 'blocked' | 'queued';

export function logBidControl(event: BidControlEvent, detail?: Record<string, unknown>): void {
  console.info(`[bid control] ${event}`, detail ?? '');
}

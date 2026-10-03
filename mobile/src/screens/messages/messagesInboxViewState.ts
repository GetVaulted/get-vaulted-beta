import { friendlyErrorText } from '../../lib/friendlyErrorText';

export type MessagesInboxViewState = 'loading' | 'error' | 'empty' | 'list';

/**
 * The inbox previously collapsed a failed fetch into `threads: []`, which rendered identically to
 * a genuinely empty inbox — a network error looked exactly like "you have no conversations."
 *
 * If we already have threads on screen (e.g. a pull-to-refresh failed after an earlier successful
 * load), keep showing that list rather than replacing good data with an error state.
 */
export function deriveMessagesInboxViewState(params: {
  loading: boolean;
  hasError: boolean;
  threadCount: number;
}): MessagesInboxViewState {
  if (params.loading) return 'loading';
  if (params.threadCount > 0) return 'list';
  if (params.hasError) return 'error';
  return 'empty';
}

/** Friendly copy for the inline error state — falls back when the thrown error has no message. */
export function describeInboxLoadError(e: unknown): string {
  return friendlyErrorText(e, "Couldn't load your messages.");
}

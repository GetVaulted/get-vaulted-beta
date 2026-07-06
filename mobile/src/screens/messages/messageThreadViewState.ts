export type MessageThreadViewState = 'loading' | 'error' | 'ready';

/**
 * `MessageThreadScreen` polls `fetchMessageThread` on an interval. A failed fetch should only
 * ever show the full-screen error state when we have nothing else to show yet — once a thread has
 * loaded successfully, a later background poll failure should not rip the conversation away from
 * under the user, so `hasThread` wins over `hasError`.
 */
export function deriveMessageThreadViewState(params: {
  loading: boolean;
  hasThread: boolean;
  hasError: boolean;
}): MessageThreadViewState {
  if (params.hasThread) return 'ready';
  if (params.loading) return 'loading';
  if (params.hasError) return 'error';
  return 'ready';
}

/** Friendly copy for the inline error state — falls back when the thrown error has no message. */
export function describeThreadLoadError(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  return "Couldn't load this conversation.";
}

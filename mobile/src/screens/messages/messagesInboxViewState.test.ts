import { describe, expect, it } from 'vitest';
import { deriveMessagesInboxViewState, describeInboxLoadError } from './messagesInboxViewState';

describe('deriveMessagesInboxViewState', () => {
  it('shows the spinner while the initial load is in flight', () => {
    expect(deriveMessagesInboxViewState({ loading: true, hasError: false, threadCount: 0 })).toBe('loading');
  });

  it('regression: shows a distinct error state instead of a fake "no conversations" empty state', () => {
    expect(deriveMessagesInboxViewState({ loading: false, hasError: true, threadCount: 0 })).toBe('error');
  });

  it('shows the genuine empty state when the load succeeded with zero threads', () => {
    expect(deriveMessagesInboxViewState({ loading: false, hasError: false, threadCount: 0 })).toBe('empty');
  });

  it('shows the list when threads are present', () => {
    expect(deriveMessagesInboxViewState({ loading: false, hasError: false, threadCount: 3 })).toBe('list');
  });

  it('keeps showing stale threads instead of an error banner if a refresh fails', () => {
    expect(deriveMessagesInboxViewState({ loading: false, hasError: true, threadCount: 3 })).toBe('list');
  });
});

describe('describeInboxLoadError', () => {
  it('uses the thrown error message when present and not a raw transport error', () => {
    expect(describeInboxLoadError(new Error('This vault event could not be found.'))).toBe(
      'This vault event could not be found.',
    );
  });

  it('replaces raw transport errors with professional copy instead of leaking them to the user', () => {
    expect(describeInboxLoadError(new Error('Network request failed'))).toBe(
      'Network error. Please check your connection and try again.',
    );
  });

  it('falls back to a friendly default for errors with no message', () => {
    expect(describeInboxLoadError(new Error(''))).toBe("Couldn't load your messages.");
  });

  it('falls back to a friendly default for non-Error throwables', () => {
    expect(describeInboxLoadError('boom')).toBe("Couldn't load your messages.");
  });
});

import { describe, expect, it } from 'vitest';
import { deriveMessageThreadViewState, describeThreadLoadError } from './messageThreadViewState';

describe('deriveMessageThreadViewState', () => {
  it('shows the spinner on first load before anything has resolved', () => {
    expect(deriveMessageThreadViewState({ loading: true, hasThread: false, hasError: false })).toBe('loading');
  });

  it('regression: shows an error state (not a blank/broken thread) when the initial fetch fails', () => {
    expect(deriveMessageThreadViewState({ loading: false, hasThread: false, hasError: true })).toBe('error');
  });

  it('shows the thread once loaded, even if a later background poll errors', () => {
    expect(deriveMessageThreadViewState({ loading: false, hasThread: true, hasError: true })).toBe('ready');
  });

  it('shows the thread normally once loaded with no error', () => {
    expect(deriveMessageThreadViewState({ loading: false, hasThread: true, hasError: false })).toBe('ready');
  });

  it('re-enters loading while a retry is in flight, even though the old error is still set', () => {
    expect(deriveMessageThreadViewState({ loading: true, hasThread: false, hasError: true })).toBe('loading');
  });
});

describe('describeThreadLoadError', () => {
  it('uses the thrown error message when present and not a raw transport error', () => {
    expect(describeThreadLoadError(new Error('This vault event could not be found.'))).toBe(
      'This vault event could not be found.',
    );
  });

  it('replaces raw transport errors with professional copy instead of leaking them to the user', () => {
    expect(describeThreadLoadError(new Error('Network request failed'))).toBe(
      'Network error. Please check your connection and try again.',
    );
  });

  it('falls back to a friendly default for errors with no message', () => {
    expect(describeThreadLoadError(new Error(''))).toBe("Couldn't load this conversation.");
  });

  it('falls back to a friendly default for non-Error throwables', () => {
    expect(describeThreadLoadError('boom')).toBe("Couldn't load this conversation.");
  });
});

import { describe, expect, it } from 'vitest';
import { appendMentionToDraft } from './liveChatUserActions';

describe('appendMentionToDraft', () => {
  it('appends a mention with spacing', () => {
    expect(appendMentionToDraft('', 'seller1')).toBe('@seller1 ');
    expect(appendMentionToDraft('hello', 'seller1')).toBe('hello @seller1 ');
    expect(appendMentionToDraft('hello ', 'seller1')).toBe('hello @seller1 ');
  });

  it('strips leading @ from username', () => {
    expect(appendMentionToDraft('', '@seller1')).toBe('@seller1 ');
  });
});

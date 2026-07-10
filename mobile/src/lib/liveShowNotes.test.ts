import { hasLiveShowNotes, normalizeLiveShowNotes, LIVE_SHOW_NOTES_MAX_CHARS } from './liveShowNotes';

describe('liveShowNotes', () => {
  it('treats empty and discovery placeholders as no notes', () => {
    expect(hasLiveShowNotes(null)).toBe(false);
    expect(hasLiveShowNotes('')).toBe(false);
    expect(hasLiveShowNotes('Live on Get Vaulted.')).toBe(false);
    expect(hasLiveShowNotes('Show notes will appear when the host publishes them.')).toBe(false);
    expect(normalizeLiveShowNotes('Live on Get Vaulted.')).toBe('');
  });

  it('keeps real seller notes', () => {
    expect(hasLiveShowNotes('  Free shipping over $50  ')).toBe(true);
    expect(normalizeLiveShowNotes('  Free shipping over $50  ')).toBe('Free shipping over $50');
  });

  it('exports the server max length', () => {
    expect(LIVE_SHOW_NOTES_MAX_CHARS).toBe(4000);
  });
});

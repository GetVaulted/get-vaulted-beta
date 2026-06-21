import type { HotClip, LiveStream } from '../types';

export function deriveHotClipsFromLive(live: LiveStream[]): HotClip[] {
  return live.slice(0, 8).map((stream) => ({
    id: `clip-${stream.id}`,
    roomId: stream.id,
    title: stream.title,
    views: stream.viewers > 0 ? `${stream.viewers.toLocaleString()} watching` : 'Live now',
    gradient: stream.thumbnailGradient,
    category: stream.category,
    imageUrl: stream.previewImageUrl,
  }));
}

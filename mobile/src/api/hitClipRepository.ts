import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Alert, Linking, Platform, Share } from 'react-native';
import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';
import { captureLiveHitClipFromHls, HIT_CLIP_CAPTURE_MS } from '../lib/captureLiveHitClip';
import { fetchBuyerLiveStream } from './liveRoomStreamRepository';
import { canonicalLiveShareSiteUrl } from '../lib/liveShareUrl';

export type HitClipDto = {
  id: string;
  title: string;
  clipUrl: string | null;
  thumbnailUrl: string;
  shareUrl: string;
  shareCaption?: string;
};

function absoluteMediaUrl(url: string): string {
  const t = url.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  const base = canonicalLiveShareSiteUrl();
  return `${base}${t.startsWith('/') ? '' : '/'}${t}`;
}

export async function createHitClip(
  accessToken: string,
  roomId: string,
  body: {
    title?: string;
    itemTitle?: string | null;
    teamOrSpotLabel?: string | null;
    liveRoomItemId?: string | null;
    thumbnailUrl?: string;
    clipUrl?: string | null;
  },
): Promise<{ clip: HitClipDto; sellerUsername: string }> {
  const res = await fetchWebApiMobile(`/api/live-rooms/${encodeURIComponent(roomId)}/hit-clips`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const raw = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    clip?: HitClipDto;
    sellerUsername?: string;
  } | null;
  if (!res.ok || !raw?.clip) {
    throw new Error(raw?.error || 'Could not create hit clip.');
  }
  return { clip: raw.clip, sellerUsername: raw.sellerUsername || 'GetVaulted' };
}

export async function uploadHitClipVideo(
  accessToken: string,
  localUri: string,
  durationMs: number,
  mime: string,
): Promise<string> {
  const ext = mime.includes('quicktime') ? 'mov' : mime.includes('mp2t') ? 'ts' : 'mp4';
  // Server only accepts mp4/mov — skip upload for raw TS (share local file / link instead).
  if (ext === 'ts') {
    throw new Error('TS_CLIP');
  }
  const form = new FormData();
  form.append('file', {
    uri: localUri,
    name: `hit-clip-${Date.now()}.${ext}`,
    type: mime.includes('quicktime') ? 'video/quicktime' : 'video/mp4',
  } as unknown as Blob);
  form.append('durationMs', String(Math.round(durationMs)));

  const res = await fetchWebApiMobile('/api/uploads/hit-clip', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const body = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !body?.url) {
    throw new Error(body?.error || 'Hit clip upload failed.');
  }
  return absoluteMediaUrl(body.url);
}

export async function attachHitClipVideo(
  accessToken: string,
  clipId: string,
  clipUrl: string,
): Promise<HitClipDto> {
  const res = await fetchWebApiMobile(`/api/hit-clips/${encodeURIComponent(clipId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clipUrl }),
  });
  const raw = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    clip?: HitClipDto;
  } | null;
  if (!res.ok || !raw?.clip) {
    throw new Error(raw?.error || 'Could not attach hit clip video.');
  }
  return raw.clip;
}

function buildCaption(title: string, sellerUsername: string, shareUrl: string): string {
  const handle = sellerUsername.replace(/^@/, '').trim() || 'GetVaulted';
  return `HIT 🔥 ${title} from @${handle} on Get Vaulted\n${shareUrl}`;
}

async function shareHitClipNative(args: {
  localUri: string | null;
  shareUrl: string;
  caption: string;
  title: string;
}): Promise<void> {
  await Clipboard.setStringAsync(args.caption);

  if (args.localUri) {
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (perm.granted) {
        await MediaLibrary.saveToLibraryAsync(args.localUri);
      }
    } catch {
      /* optional camera-roll save */
    }

    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(args.localUri, {
          mimeType: 'video/mp4',
          dialogTitle: 'Share Hit Clip to TikTok',
          UTI: 'public.movie',
        });
        return;
      }
    } catch {
      /* fall through */
    }

    try {
      if (Platform.OS === 'ios') {
        await Share.share({ url: args.localUri });
        return;
      }
    } catch {
      /* fall through */
    }
  }

  try {
    await Share.share({
      title: args.title,
      message: args.caption,
      url: Platform.OS === 'ios' ? args.shareUrl : undefined,
    });
  } catch {
    /* cancelled */
  }
}

export type CreateAndShareHitClipArgs = {
  accessToken: string;
  roomId: string;
  showTitle: string;
  hostUsername: string;
  activeItemId?: string | null;
  activeItemTitle?: string | null;
  teamOrSpotLabel?: string | null;
  thumbnailUrl?: string | null;
  onProgress?: (label: string) => void;
};

/**
 * Full Clip button flow: capture HLS → upload → HitClip row → share to TikTok / camera roll.
 */
export async function createAndShareHitClip(args: CreateAndShareHitClipArgs): Promise<void> {
  const { accessToken, roomId, onProgress } = args;
  onProgress?.('Getting stream…');
  const stream = await fetchBuyerLiveStream(roomId, accessToken);
  const playbackUrl = stream?.playbackUrl?.trim() || null;
  if (!playbackUrl) {
    throw new Error(
      'Hit Clip needs the live video mirror. Wait until host video is playing, then tap Clip again.',
    );
  }

  onProgress?.('Capturing hit…');
  const captured = await captureLiveHitClipFromHls(playbackUrl, {
    captureMs: HIT_CLIP_CAPTURE_MS,
    onProgress: (ms) => {
      const left = Math.max(0, Math.ceil((HIT_CLIP_CAPTURE_MS - ms) / 1000));
      onProgress?.(left > 0 ? `Capturing hit… ${left}s` : 'Saving hit…');
    },
  });

  onProgress?.('Creating Hit Clip…');
  const title =
    args.activeItemTitle?.trim()
      ? `HIT · ${args.activeItemTitle.trim()}`
      : args.showTitle.trim()
        ? `HIT · ${args.showTitle.trim()}`
        : 'HIT on Get Vaulted';

  const { clip, sellerUsername } = await createHitClip(accessToken, roomId, {
    title,
    itemTitle: args.activeItemTitle ?? null,
    teamOrSpotLabel: args.teamOrSpotLabel ?? null,
    liveRoomItemId: args.activeItemId ?? null,
    thumbnailUrl: args.thumbnailUrl?.trim() || undefined,
  });

  let localUri: string | null = captured.uri;
  let shareUrl = clip.shareUrl;
  let finalTitle = clip.title;

  if (captured.format === 'fmp4') {
    try {
      onProgress?.('Uploading…');
      const clipUrl = await uploadHitClipVideo(accessToken, captured.uri, captured.durationMs, captured.mime);
      const updated = await attachHitClipVideo(accessToken, clip.id, clipUrl);
      shareUrl = updated.shareUrl;
      finalTitle = updated.title;
    } catch {
      /* still share local file */
    }
  }

  const caption = buildCaption(finalTitle, sellerUsername || args.hostUsername, shareUrl);
  onProgress?.('Share to TikTok…');
  await shareHitClipNative({ localUri, shareUrl, caption, title: finalTitle });

  Alert.alert(
    'Hit Clip ready',
    captured.format === 'fmp4'
      ? 'Video saved to your camera roll when permitted. Caption is copied — paste it in TikTok.'
      : 'Clip captured. Caption and link are ready — open TikTok and paste. (Full MP4 upload needs the stream mirror in fMP4 form.)',
    [
      { text: 'Open TikTok', onPress: () => void Linking.openURL('https://www.tiktok.com') },
      { text: 'Done', style: 'cancel' },
    ],
  );
}

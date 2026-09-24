import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';
import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';

export type PullMediaDto = {
  id: string;
  sellerId: string;
  type: 'PHOTO' | 'VIDEO';
  url: string;
  durationMs: number | null;
  byteSize: number | null;
  sortOrder: number;
  likeCount?: number;
  commentCount?: number;
  viewerHasLiked?: boolean;
};

export type PullCommentDto = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; username: string; image: string | null };
  canDelete: boolean;
};

/** Public — buyer-facing gallery for any seller's profile (no auth required). */
export async function fetchSellerPullMedia(sellerId: string): Promise<PullMediaDto[]> {
  const res = await fetchWebApiMobile(`/api/sellers/pull-media?sellerId=${encodeURIComponent(sellerId)}`, {
    method: 'GET',
  });
  if (!res.ok) return [];
  const body = (await res.json().catch(() => null)) as { media?: PullMediaDto[] } | null;
  return body?.media ?? [];
}

/** Caller's own media — management screen. */
export async function fetchMyPullMedia(accessToken: string): Promise<PullMediaDto[]> {
  const res = await fetchWebApiAuthed('/api/profile/pull-media', accessToken, { method: 'GET' });
  if (!res.ok) return [];
  const body = (await res.json().catch(() => null)) as { media?: PullMediaDto[] } | null;
  return body?.media ?? [];
}

export async function uploadPullPhoto(accessToken: string, localUri: string): Promise<PullMediaDto> {
  const form = new FormData();
  form.append('file', {
    uri: localUri,
    name: `pull-${Date.now()}.jpg`,
    type: 'image/jpeg',
  } as unknown as Blob);

  const res = await fetchWebApiAuthed('/api/uploads/profile-pull-photo', accessToken, {
    method: 'POST',
    body: form,
  });
  const body = (await res.json().catch(() => null)) as { media?: PullMediaDto; error?: string } | null;
  if (!res.ok || !body?.media) {
    throw new Error(body?.error || 'Photo upload failed.');
  }
  return body.media;
}

export async function uploadPullVideo(
  accessToken: string,
  localUri: string,
  durationMs: number,
  mime: 'video/mp4' | 'video/quicktime' = 'video/mp4',
): Promise<PullMediaDto> {
  const ext = mime === 'video/quicktime' ? 'mov' : 'mp4';
  const form = new FormData();
  form.append('file', {
    uri: localUri,
    name: `pull-${Date.now()}.${ext}`,
    type: mime,
  } as unknown as Blob);
  form.append('durationMs', String(Math.round(durationMs)));

  const res = await fetchWebApiAuthed('/api/uploads/profile-pull-video', accessToken, {
    method: 'POST',
    body: form,
  });
  const body = (await res.json().catch(() => null)) as { media?: PullMediaDto; error?: string } | null;
  if (!res.ok || !body?.media) {
    throw new Error(body?.error || 'Video upload failed.');
  }
  return body.media;
}

export async function deletePullMedia(accessToken: string, id: string): Promise<void> {
  const res = await fetchWebApiAuthed(`/api/profile/pull-media/${encodeURIComponent(id)}`, accessToken, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || 'Could not delete that item.');
  }
}

export async function reorderPullMedia(accessToken: string, orderedIds: string[]): Promise<PullMediaDto[]> {
  const res = await fetchWebApiAuthed('/api/profile/pull-media', accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order: orderedIds }),
  });
  const body = (await res.json().catch(() => null)) as { media?: PullMediaDto[]; error?: string } | null;
  if (!res.ok || !body?.media) {
    throw new Error(body?.error || 'Could not save the new order.');
  }
  return body.media;
}

/** Like/unlike — requires auth. Returns the resulting state so the caller can reconcile optimistic UI. */
export async function likePullMedia(accessToken: string, id: string): Promise<{ liked: boolean; likeCount: number }> {
  const res = await fetchWebApiAuthed(`/api/pull-media/${encodeURIComponent(id)}/like`, accessToken, {
    method: 'POST',
  });
  const body = (await res.json().catch(() => null)) as { liked?: boolean; likeCount?: number } | null;
  if (!res.ok || body?.liked == null) throw new Error('Could not like this pull.');
  return { liked: body.liked, likeCount: body.likeCount ?? 0 };
}

export async function unlikePullMedia(accessToken: string, id: string): Promise<{ liked: boolean; likeCount: number }> {
  const res = await fetchWebApiAuthed(`/api/pull-media/${encodeURIComponent(id)}/like`, accessToken, {
    method: 'DELETE',
  });
  const body = (await res.json().catch(() => null)) as { liked?: boolean; likeCount?: number } | null;
  if (!res.ok) throw new Error('Could not unlike this pull.');
  return { liked: body?.liked ?? false, likeCount: body?.likeCount ?? 0 };
}

/** Public — no auth required to read comments. */
export async function fetchPullComments(id: string): Promise<PullCommentDto[]> {
  const res = await fetchWebApiMobile(`/api/pull-media/${encodeURIComponent(id)}/comments`, { method: 'GET' });
  if (!res.ok) return [];
  const body = (await res.json().catch(() => null)) as { comments?: PullCommentDto[] } | null;
  return body?.comments ?? [];
}

export async function postPullComment(accessToken: string, id: string, body: string): Promise<PullCommentDto> {
  const res = await fetchWebApiAuthed(`/api/pull-media/${encodeURIComponent(id)}/comments`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  const json = (await res.json().catch(() => null)) as { comment?: PullCommentDto; error?: string } | null;
  if (!res.ok || !json?.comment) {
    throw new Error(json?.error || 'Could not post that comment.');
  }
  return json.comment;
}

export async function deletePullComment(accessToken: string, id: string, commentId: string): Promise<void> {
  const res = await fetchWebApiAuthed(
    `/api/pull-media/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}`,
    accessToken,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || 'Could not delete that comment.');
  }
}
